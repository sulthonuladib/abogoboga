import { BunSocket } from "@effect/platform-bun"
import { MexcWebSocketProto } from "@lister/generated"
import {
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory,
  WorkerSourceError
} from "@lister/worker-contract"
import { Clock, Deferred, Effect, Ref, Stream } from "effect"
import * as Socket from "effect/socket/Socket"

import {
  type ClientMessage,
  type PingRequest,
  type SubscriptionRequest,
  depthChannelFor,
  normalizeSymbol,
  pingInterval,
  pingMethod,
  subscribeMethod,
  unsubscribeMethod,
  wsUrl
} from "./mexc.ts"
import { tickFromDepths } from "./orderbook.ts"

/**
 * Depth levels requested per pair; matches {@link depthLevels} in the channel.
 */
const emitDepth = 20

/**
 * Minimum interval between emitted ticks per pair, in milliseconds. MEXC pushes
 * several times per second; the parent only needs about one tick per second.
 */
const emitIntervalMillis = 1000

/**
 * One decoded MEXC push wrapper.
 */
type DecodedPush = ReturnType<typeof MexcWebSocketProto.PushDataV3ApiWrapper.decode>

/**
 * Build a worker source failure with an optional underlying cause.
 *
 * @param message - One-line failure description.
 * @param cause - Optional underlying defect.
 */
const sourceError = (message: string, cause?: unknown): WorkerSourceError =>
  new WorkerSourceError({ message, cause })

/**
 * Decode one binary frame as a MEXC protobuf push.
 *
 * @param bytes - Raw frame bytes.
 * @returns The decoded wrapper, or `null` when the frame is not a valid push.
 */
const decodePush = (bytes: Uint8Array): DecodedPush | null => {
  try {
    return MexcWebSocketProto.PushDataV3ApiWrapper.decode(bytes)
  } catch {
    return null
  }
}

/**
 * mexc worker owner hook.
 *
 * Keeps one protobuf WebSocket (`wss://wbs-api.mexc.com/ws`) open: it subscribes
 * to `spot@public.limit.depth.v3.api.pb@<pair>@20` channels with JSON control
 * messages, answers keepalives, and decodes binary frames with the generated
 * `PushDataV3ApiWrapper`. Each push is a complete limited-depth snapshot; pushes
 * are throttled to at most one tick per second per pair with a last-sent store.
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
    // Closed when the host tears the worker down; interrupts `ticks`.
    const closed = yield* Deferred.make<void>()

    const socket = yield* Socket.makeWebSocket(wsUrl).pipe(Effect.provide(BunSocket.layerWebSocketConstructor))

    const write = (message: ClientMessage): Effect.Effect<void, WorkerSourceError> =>
      Effect.scoped(
        Effect.gen(function*() {
          const writer = yield* socket.writer

          yield* writer.write(JSON.stringify(message)).pipe(
            Effect.mapError((cause) => sourceError("mexc: websocket write failed", cause))
          )
        })
      )

    const sendSubscription = (
      method: SubscriptionRequest["method"],
      channel: string
    ): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const request: SubscriptionRequest = { method, params: [channel] }

        yield* write(request)
      })

    const sendPing = (): Effect.Effect<void> =>
      Effect.gen(function*() {
        const request: PingRequest = { method: pingMethod }

        yield* write(request).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`mexc: ping failed: ${error.message ?? "unknown"}`)
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

        yield* sendSubscription(subscribeMethod, depthChannelFor(pair))
      })

    const unsubscribeOne = (coin: BootstrapCoin): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        yield* sendSubscription(unsubscribeMethod, depthChannelFor(pair)).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`mexc: unsubscribe failed for ${pair}: ${error.message ?? "unknown"}`)
          )
        )

        yield* Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          next.delete(pair)

          return next
        })
      })

    const handleFrame = (bytes: Uint8Array): Effect.Effect<CanonicalTick | null> =>
      Effect.gen(function*() {
        // JSON control frames start with `{`; protobuf pushes start with a field tag.
        if (bytes[0] === 0x7b) return null

        const message = decodePush(bytes)

        if (message === null) return null

        const depths = message.publicLimitDepths
        const symbol = message.symbol

        if (depths === undefined || symbol === undefined) return null

        const pair = normalizeSymbol(symbol)
        const coin = yield* Ref.get(subscriptions).pipe(Effect.map((current) => current.get(pair)))

        if (coin === undefined) return null

        if (!(yield* shouldEmit(pair))) return null

        const timestamp = message.sendTime ?? (yield* Clock.currentTimeMillis)

        return tickFromDepths(depths, coin, exchangeSlug, timestamp, emitDepth)
      })

    const ticks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerBytes(socket).pipe(
          Effect.mapError((cause) => sourceError("mexc: websocket open failed", cause))
        )

        yield* Effect.forEach(
          initial,
          (coin) =>
            subscribeOne(coin).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `mexc: bootstrap subscribe failed for ${coin.symbol}: ${error.message ?? "unknown"}`
                )
              )
            ),
          { concurrency: "unbounded", discard: true }
        )

        const messages = Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("mexc: websocket read failed", cause)))
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
