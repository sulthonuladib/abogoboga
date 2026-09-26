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
  ControlRequest,
  OrderBookUpdate,
  depthInterval,
  depthLevels,
  normalizeSymbol,
  orderBookChannel,
  wsUrl
} from "./gateio.ts"
import { tickFor } from "./orderbook.ts"

/**
 * Maximum depth levels emitted per side on every tick. Gate.io pushes exactly
 * this many levels per snapshot (`depthLevels`), so the emitted book is bounded
 * while the crawl only needs enough depth to reach the IDR executable target.
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
 * gateio worker owner hook.
 *
 * Keeps one raw WebSocket (`/ws/v4`) open and uses live `subscribe`/`unsubscribe`
 * control messages so the subscription set follows the host's live RPC commands.
 * Gate.io's `spot.order_book` channel pushes full limited-depth snapshots, so
 * each update is emitted as a tick directly with no local-book maintenance.
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
    // Closed when the host tears the worker down; interrupts `ticks`.
    const closed = yield* Deferred.make<void>()

    const socket = yield* Socket.makeWebSocket(wsUrl).pipe(Effect.provide(BunSocket.layerWebSocketConstructor))

    const send = (event: "subscribe" | "unsubscribe", pair: string): Effect.Effect<void, WorkerSourceError> =>
      Effect.scoped(
        Effect.gen(function*() {
          const writer = yield* socket.writer

          const message: ControlRequest = {
            time: Math.floor((yield* Clock.currentTimeMillis) / 1000),
            channel: orderBookChannel,
            event,
            payload: [pair, depthLevels, depthInterval]
          }

          yield* writer.write(JSON.stringify(message)).pipe(
            Effect.mapError((cause) => sourceError("gateio: websocket write failed", cause))
          )
        })
      )

    const subscribeOne = (coin: BootstrapCoin): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        const registered = yield* Ref.modify(subscriptions, (map) => {
          if (map.has(pair)) return [false as const, map]

          const next = new Map(map)

          next.set(pair, coin)

          return [true as const, next]
        })

        if (!registered) return

        yield* send("subscribe", pair)
      })

    const unsubscribeOne = (coin: BootstrapCoin): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const pair = normalizeSymbol(coin.symbol)

        yield* send("unsubscribe", pair).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`gateio: unsubscribe failed for ${pair}: ${error.message ?? "unknown"}`)
          )
        )

        yield* Ref.update(subscriptions, (map) => {
          const next = new Map(map)

          next.delete(pair)

          return next
        })
      })

    const parseFrame = (frame: string): OrderBookUpdate | null => {
      let raw: unknown

      try {
        raw = JSON.parse(frame)
      } catch {
        return null
      }

      return Option.getOrNull(Schema.decodeUnknownOption(OrderBookUpdate)(raw))
    }

    const handleFrame = (frame: string): Effect.Effect<CanonicalTick | null, WorkerSourceError> =>
      Effect.gen(function*() {
        const update = parseFrame(frame)

        if (update === null) return null

        const pair = normalizeSymbol(update.result.s)
        const coin = yield* Ref.get(subscriptions).pipe(Effect.map((map) => map.get(pair)))

        if (coin === undefined) return null

        return tickFor(update.result, coin, exchangeSlug, update.time_ms, emitDepth)
      })

    const ticks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket).pipe(
          Effect.mapError((cause) => sourceError("gateio: websocket open failed", cause))
        )

        yield* Effect.forEach(
          initial,
          (coin) =>
            subscribeOne(coin).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `gateio: bootstrap subscribe failed for ${coin.symbol}: ${error.message ?? "unknown"}`
                )
              )
            ),
          { concurrency: "unbounded", discard: true }
        )

        return Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("gateio: websocket read failed", cause)))
        ).pipe(
          Stream.flatMap((frames) => Stream.fromIterable(frames)),
          // Snapshots are independent, but sequential processing keeps tick
          // emission ordered per pair.
          Stream.mapEffect(handleFrame),
          Stream.filter((tick): tick is CanonicalTick => tick !== null)
        )
      })
    ).pipe(Stream.interruptWhen(Deferred.await(closed)))

    return {
      subscribe: (coins) => Effect.forEach(coins, subscribeOne, { discard: true }),
      unsubscribe: (coins) => Effect.forEach(coins, unsubscribeOne, { discard: true }),
      ticks,
      close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)
    }
  })
