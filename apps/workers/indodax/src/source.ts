import { BunSocket } from "@effect/platform-bun"
import {
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory,
  WorkerSourceError
} from "@lister/worker-contract"
import { Clock, Deferred, Effect, Option, Ref, Schema, Stream } from "effect"
import * as Socket from "effect/unstable/socket/Socket"

import {
  type AuthRequest,
  type ChannelRequest,
  type ClientMessage,
  type OrderBook,
  OrderBookMessage,
  type PingRequest,
  normalizeSymbol,
  orderBookChannelFor,
  pingInterval,
  pingMethod,
  sampleInterval,
  staticToken,
  subscribeMethod,
  unsubscribeMethod,
  wsUrl
} from "./indodax.ts"
import { tickFor } from "./orderbook.ts"

/**
 * Maximum depth levels emitted per side on every tick. Indodax pushes a full
 * book snapshot on each message, but the emitted book is capped here because
 * the crawl only needs enough depth to reach the IDR executable target.
 */
const emitDepth = 50

/**
 * Build a worker source failure with an optional underlying cause.
 *
 * @param message - One-line failure description.
 * @param cause - Optional underlying defect.
 */
const sourceError = (message: string, cause?: unknown): WorkerSourceError =>
  new WorkerSourceError({ message, cause })

/**
 * indodax worker owner hook.
 *
 * Keeps one raw WebSocket (`wss://ws3.indodax.com/ws/`) open: it authenticates
 * with the static token, subscribes to `market:order-book-<pair>` channels
 * with live control messages, and answers keepalive pings. Indodax pushes full
 * order-book snapshots on change rather than at a fixed 100ms, so the worker
 * samples the latest book once per second and emits a `CanonicalTick` per
 * subscribed pair, per the workers guidance.
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
    // Normalized pair symbol → latest complete order-book snapshot.
    const books = yield* Ref.make<ReadonlyMap<string, OrderBook>>(new Map())
    // Monotonic request id for the Indodax wire protocol. The server rejects
    // `id: 0` as a bad request, so ids are positive and strictly increasing.
    const ids = yield* Ref.make(1)
    // Closed when the host tears the worker down; interrupts `ticks`.
    const closed = yield* Deferred.make<void>()

    const socket = yield* Socket.makeWebSocket(wsUrl).pipe(Effect.provide(BunSocket.layerWebSocketConstructor))

    const nextId = (): Effect.Effect<number> => Ref.modify(ids, (current) => [current, current + 1])

    const write = (message: ClientMessage): Effect.Effect<void, WorkerSourceError> =>
      Effect.scoped(
        Effect.gen(function*() {
          const writer = yield* socket.writer

          yield* writer.write(JSON.stringify(message)).pipe(
            Effect.mapError((cause) => sourceError("indodax: websocket write failed", cause))
          )
        })
      )

    const authenticate = (): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const request: AuthRequest = { params: { token: staticToken }, id: yield* nextId() }

        yield* write(request)
      })

    const sendChannel = (method: number, channel: string): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const request: ChannelRequest = { method, params: { channel }, id: yield* nextId() }

        yield* write(request)
      })

    const sendPing = (): Effect.Effect<void> =>
      Effect.gen(function*() {
        const request: PingRequest = { method: pingMethod, id: yield* nextId() }

        yield* write(request).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`indodax: ping failed: ${error.message ?? "unknown"}`)
          )
        )
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

        yield* sendChannel(subscribeMethod, orderBookChannelFor(pair))
      })

    const unsubscribeOne = (coin: BootstrapCoin): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        yield* sendChannel(unsubscribeMethod, orderBookChannelFor(pair)).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`indodax: unsubscribe failed for ${pair}: ${error.message ?? "unknown"}`)
          )
        )

        yield* Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          next.delete(pair)

          return next
        })

        yield* Ref.update(books, (current) => {
          const next = new Map(current)

          next.delete(pair)

          return next
        })
      })

    const parseFrame = (frame: string): OrderBookMessage | null => {
      let raw: unknown

      try {
        raw = JSON.parse(frame)
      } catch {
        return null
      }

      return Option.getOrNull(Schema.decodeUnknownOption(OrderBookMessage)(raw))
    }

    const handleFrame = (frame: string): Effect.Effect<void> =>
      Effect.gen(function*() {
        const message = parseFrame(frame)

        if (message === null) return

        const book = message.result.data.data
        const pair = normalizeSymbol(book.pair)

        const subscribed = yield* Ref.get(subscriptions).pipe(
          Effect.map((current) => current.has(pair))
        )

        if (!subscribed) return

        yield* Ref.update(books, (current) => {
          const next = new Map(current)

          next.set(pair, book)

          return next
        })
      })

    const emitTicks = (): Effect.Effect<ReadonlyArray<CanonicalTick>> =>
      Effect.gen(function*() {
        const timestamp = yield* Clock.currentTimeMillis
        const currentBooks = yield* Ref.get(books)
        const currentSubscriptions = yield* Ref.get(subscriptions)
        const ticks: Array<CanonicalTick> = []

        for (const [pair, book] of currentBooks) {
          const coin = currentSubscriptions.get(pair)

          if (coin === undefined) continue

          ticks.push(tickFor(book, coin, exchangeSlug, timestamp, emitDepth))
        }

        return ticks
      })

    const ticks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket).pipe(
          Effect.mapError((cause) => sourceError("indodax: websocket open failed", cause))
        )

        yield* authenticate()

        yield* Effect.forEach(
          initial,
          (coin) =>
            subscribeOne(coin).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `indodax: bootstrap subscribe failed for ${coin.symbol}: ${error.message ?? "unknown"}`
                )
              )
            ),
          { concurrency: "unbounded", discard: true }
        )

        const frames = Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("indodax: websocket read failed", cause)))
        ).pipe(
          Stream.flatMap((batch) => Stream.fromIterable(batch))
        )

        // Read loop: keeps the latest book per pair, emitting nothing itself.
        const updates = frames.pipe(Stream.mapEffect(handleFrame), Stream.drain)

        // Once-per-second sample of every subscribed pair's latest book.
        const samples = Stream.tick(sampleInterval).pipe(
          Stream.mapEffect(() => emitTicks()),
          Stream.flatMap((batch) => Stream.fromIterable(batch))
        )

        const pings = Stream.tick(pingInterval).pipe(
          Stream.mapEffect(() => sendPing()),
          Stream.drain
        )

        return Stream.merge(updates, Stream.merge(samples, pings))
      })
    ).pipe(Stream.interruptWhen(Deferred.await(closed)))

    return {
      subscribe: (coins) => Effect.forEach(coins, subscribeOne, { discard: true }),
      unsubscribe: (coins) => Effect.forEach(coins, unsubscribeOne, { discard: true }),
      ticks,
      close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)
    }
  })
