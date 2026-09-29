import { BunHttpClient, BunSocket } from "@effect/platform-bun"
import {
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory,
  WorkerSourceError
} from "@lister/worker-contract"
import { Clock, Deferred, Duration, Effect, Option, Ref, Schema, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"

import {
  BulletPublicResponse,
  type ClientMessage,
  type InstanceServer,
  type PingRequest,
  type PongRequest,
  ServerMessage,
  type SubscribeRequest,
  bulletPublicUrl,
  normalizeSymbol,
  orderBookTopicFor,
  orderBookTopicPrefix
} from "./kucoin.ts"
import { tickFor } from "./orderbook.ts"

/**
 * Maximum depth levels emitted per side on every tick. KuCoin pushes 50 levels;
 * the emitted book is capped here because the crawl only needs enough depth to
 * reach the IDR executable target.
 */
const emitDepth = 50

/**
 * Minimum interval between emitted ticks per pair, in milliseconds. KuCoin
 * pushes up to every 100ms; the parent only needs about one tick per second.
 */
const emitIntervalMillis = 1000

/**
 * Spacing between subscription control messages, in milliseconds. KuCoin
 * disconnects a client that floods subscribe requests, so at most ten leave per
 * second.
 */
const subscriptionSpacingMillis = 100

/**
 * Client keepalive cadence, safely under the 18-second server `pingInterval`.
 */
const pingInterval = "15 seconds" as const

/**
 * Build a worker source failure with an optional underlying cause.
 *
 * @param message - One-line failure description.
 * @param cause - Optional underlying defect.
 */
const sourceError = (message: string, cause?: unknown): WorkerSourceError =>
  new WorkerSourceError({ message, cause })

/**
 * A resolved KuCoin public connection: instance server plus token.
 */
interface Connection {
  /** WebSocket instance server endpoint. */
  readonly endpoint: string
  /** Short-lived public token appended to the endpoint. */
  readonly token: string
}

/**
 * Fetch the public WebSocket token and first instance server.
 *
 * The token is valid for 24 hours and the connection is expected to drop after
 * that; the host's reconnect schedule rebuilds the source, fetching a fresh
 * token each time.
 */
const fetchConnection = (): Effect.Effect<Connection, WorkerSourceError> =>
  Effect.gen(function*() {
    const response = yield* HttpClient.post(bulletPublicUrl).pipe(
      Effect.provide(BunHttpClient.layer),
      Effect.mapError((cause) => sourceError("kucoin: bullet-public request failed", cause))
    )

    const body = yield* HttpClientResponse.schemaBodyJson(BulletPublicResponse)(response).pipe(
      Effect.mapError((cause) => sourceError("kucoin: bullet-public response decode failed", cause))
    )

    const server: InstanceServer = body.data.instanceServers[0]

    return { endpoint: server.endpoint, token: body.data.token }
  })

/**
 * kucoin worker owner hook.
 *
 * Posts to `bullet-public` for a token and instance server, opens one socket,
 * and subscribes to `/spotMarket/level2Depth50:<pair>` topics with live control
 * messages. Each push is a complete 50-level snapshot at up to 100ms; pushes
 * are throttled to at most one tick per second per pair with a last-sent store,
 * and subscription control messages are spaced to at most ten per second so a
 * large shard never floods the server. The worker answers server pings and
 * sends its own keepalive pings.
 *
 * - `initial` seeds the subscription set at boot.
 * - `subscribe`/`unsubscribe` mutate that set live.
 * - every `ticks` value is a `CanonicalTick`; the host forwards each as
 *   one tick over the `Ticks` RPC.
 */
export const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    const exchangeSlug = context.exchangeSlug

    // Normalized pair symbol → subscribed coin.
    const subscriptions = yield* Ref.make<ReadonlyMap<string, BootstrapCoin>>(new Map())
    // Normalized pair symbol → last emitted epoch-millisecond time.
    const lastSent = yield* Ref.make<ReadonlyMap<string, number>>(new Map())
    // Monotonic subscribe/unsubscribe request id.
    const ids = yield* Ref.make(1)
    // Next free subscription slot (epoch ms), spacing control writes.
    const nextSlot = yield* Ref.make(0)
    // Closed when the host tears the worker down; interrupts `ticks`.
    const closed = yield* Deferred.make<void>()

    const connection = yield* fetchConnection()

    const url = `${connection.endpoint}?token=${encodeURIComponent(connection.token)}&connectId=${
      globalThis.crypto.randomUUID()
    }`

    const socket = yield* Socket.makeWebSocket(url).pipe(Effect.provide(BunSocket.layerWebSocketConstructor))

    const nextId = (): Effect.Effect<number> => Ref.modify(ids, (current) => [current, current + 1])

    const write = (message: ClientMessage): Effect.Effect<void, WorkerSourceError> =>
      Effect.scoped(
        Effect.gen(function*() {
          const writer = yield* socket.writer

          yield* writer.write(JSON.stringify(message)).pipe(
            Effect.mapError((cause) => sourceError("kucoin: websocket write failed", cause))
          )
        })
      )

    const acquireSubscriptionSlot = (): Effect.Effect<void> =>
      Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis

        const slot = yield* Ref.modify(nextSlot, (current) => {
          const start = current > now ? current : now

          return [start, start + subscriptionSpacingMillis]
        })

        const wait = slot - now

        if (wait > 0) yield* Effect.sleep(Duration.millis(wait))
      })

    const sendSubscription = (
      kind: "subscribe" | "unsubscribe",
      topic: string
    ): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const request: SubscribeRequest = { id: yield* nextId(), type: kind, topic, response: true }

        yield* acquireSubscriptionSlot()
        yield* write(request)
      })

    const subscribeOne = (coin: BootstrapCoin): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        const registered = yield* Ref.modify(subscriptions, (current) => {
          if (current.has(pair)) return [false as const, current]

          const next = new Map(current)

          next.set(pair, coin)

          return [true as const, next]
        })

        if (!registered) return

        yield* sendSubscription("subscribe", orderBookTopicFor(pair))
      })

    const unsubscribeOne = (coin: BootstrapCoin): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        yield* sendSubscription("unsubscribe", orderBookTopicFor(pair)).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`kucoin: unsubscribe failed for ${pair}: ${error.message ?? "unknown"}`)
          )
        )

        yield* Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          next.delete(pair)

          return next
        })
      })

    const sendPong = (id: string | number): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const request: PongRequest = { id, type: "pong" }

        yield* write(request)
      })

    const sendPing = (): Effect.Effect<void> =>
      Effect.gen(function*() {
        const request: PingRequest = { id: String(yield* nextId()), type: "ping" }

        yield* write(request).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`kucoin: ping failed: ${error.message ?? "unknown"}`)
          )
        )
      })

    const shouldEmit = (pair: string): Effect.Effect<boolean> =>
      Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        const previous = yield* Ref.get(lastSent).pipe(Effect.map((current) => current.get(pair) ?? 0))

        if (now - previous < emitIntervalMillis) return false

        yield* Ref.update(lastSent, (current) => {
          const next = new Map(current)

          next.set(pair, now)

          return next
        })

        return true
      })

    const parseFrame = (frame: string): ServerMessage | null => {
      let raw: unknown

      try {
        raw = JSON.parse(frame)
      } catch {
        return null
      }

      return Option.getOrNull(Schema.decodeUnknownOption(ServerMessage)(raw))
    }

    const handleFrame = (frame: string): Effect.Effect<CanonicalTick | null, WorkerSourceError> =>
      Effect.gen(function*() {
        const message = parseFrame(frame)

        if (message === null) return null

        if (message.type === "ping") {
          yield* sendPong(message.id)

          return null
        }

        const pair = message.topic.slice(orderBookTopicPrefix.length)
        const coin = yield* Ref.get(subscriptions).pipe(Effect.map((current) => current.get(pair)))

        if (coin === undefined) return null

        if (!(yield* shouldEmit(pair))) return null

        return tickFor(message.data, coin, exchangeSlug, message.data.timestamp, emitDepth)
      })

    const ticks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket).pipe(
          Effect.mapError((cause) => sourceError("kucoin: websocket open failed", cause))
        )

        yield* Effect.forEach(
          initial,
          (coin) =>
            subscribeOne(coin).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `kucoin: bootstrap subscribe failed for ${coin.symbol}: ${error.message ?? "unknown"}`
                )
              )
            ),
          { concurrency: "unbounded", discard: true }
        )

        const messages = Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("kucoin: websocket read failed", cause)))
        ).pipe(
          Stream.flatMap((batch) => Stream.fromIterable(batch)),
          Stream.mapEffect(handleFrame),
          Stream.filter((tick): tick is CanonicalTick => tick !== null)
        )

        const pings = Stream.tick(pingInterval).pipe(
          Stream.mapEffect(() => sendPing()),
          Stream.drain
        )

        return Stream.merge(messages, pings)
      })
    ).pipe(Stream.interruptWhen(Deferred.await(closed)))

    return {
      subscribe: (coins) => Effect.forEach(coins, subscribeOne, { discard: true }),
      unsubscribe: (coins) => Effect.forEach(coins, unsubscribeOne, { discard: true }),
      ticks,
      close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)
    }
  })
