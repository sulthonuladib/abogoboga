import { BunSocket } from "@effect/platform-bun"
import {
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory,
  WorkerSourceError
} from "@lister/worker-contract"
import { Clock, Deferred, Effect, Option, Ref, Schema, Stream } from "effect"
import * as Socket from "effect/socket/Socket"

import {
  PartialDepthMessage,
  partialDepthStreamFor,
  type ControlRequest,
  wsUrl
} from "./binance.ts"
import { tickFromPartialBook } from "./partialBook.ts"

/**
 * Build a worker source failure with an optional underlying cause.
 *
 * @param message - One-line failure description.
 * @param cause - Optional underlying defect.
 */
const sourceError = (message: string, cause?: unknown): WorkerSourceError =>
  new WorkerSourceError({ message, cause })

/**
 * Parse one combined WebSocket frame, ignoring subscription acknowledgements
 * and malformed payloads.
 *
 * @param frame - Raw JSON frame.
 * @returns A decoded partial-depth message, or `null` for a non-data frame.
 */
const parseFrame = (frame: string): PartialDepthMessage | null => {
  let raw: unknown

  try {
    raw = JSON.parse(frame)
  } catch {
    return null
  }

  return Option.getOrNull(Schema.decodeUnknownOption(PartialDepthMessage)(raw))
}

/**
 * Binance worker owner hook using complete top-20 partial-depth updates.
 *
 * Bootstrap and live subscriptions are sent as batched stream-control
 * messages. Each combined-stream envelope identifies its coin, so no REST
 * snapshot or local diff-depth book is needed.
 */
export const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    const exchangeSlug = context.exchangeSlug
    const subscriptions = yield* Ref.make<ReadonlyMap<string, BootstrapCoin>>(new Map())
    const ids = yield* Ref.make(0)
    const closed = yield* Deferred.make<void>()
    const socket = yield* Socket.makeWebSocket(wsUrl).pipe(Effect.provide(BunSocket.layerWebSocketConstructor))

    const nextId = (): Effect.Effect<number> => Ref.modify(ids, (n) => [n, n + 1])

    const send = (message: ControlRequest): Effect.Effect<void, WorkerSourceError> =>
      Effect.scoped(
        Effect.gen(function*() {
          const writer = yield* socket.writer

          yield* writer.write(JSON.stringify(message)).pipe(
            Effect.mapError((cause) => sourceError("binance: websocket write failed", cause))
          )
        })
      )

    const sendStreams = (
      method: ControlRequest["method"],
      streams: ReadonlyArray<string>
    ): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const [first, ...rest] = streams

        if (first === undefined) return

        yield* send({ method, params: [first, ...rest], id: yield* nextId() })
      })

    const subscribe = (coins: ReadonlyArray<BootstrapCoin>): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const streams = yield* Ref.modify(subscriptions, (current) => {
          const next = new Map(current)
          const added: Array<string> = []

          for (const coin of coins) {
            const stream = partialDepthStreamFor(coin.symbol)

            if (next.has(stream)) continue

            next.set(stream, coin)
            added.push(stream)
          }

          return [added, next]
        })

        yield* sendStreams("SUBSCRIBE", streams)
      })

    const unsubscribe = (coins: ReadonlyArray<BootstrapCoin>): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const streams = yield* Ref.modify(subscriptions, (current) => {
          const next = new Map(current)
          const removed: Array<string> = []

          for (const coin of coins) {
            const stream = partialDepthStreamFor(coin.symbol)

            if (!next.delete(stream)) continue

            removed.push(stream)
          }

          return [removed, next]
        })

        yield* sendStreams("UNSUBSCRIBE", streams).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`binance: unsubscribe failed: ${error.message ?? "unknown"}`)
          )
        )
      })

    const handleFrame = (frame: string): Effect.Effect<CanonicalTick | null> =>
      Effect.gen(function*() {
        const message = parseFrame(frame)

        if (message === null) return null

        const coin = yield* Ref.get(subscriptions).pipe(Effect.map((current) => current.get(message.stream)))

        if (coin === undefined) return null

        const receivedAt = yield* Clock.currentTimeMillis

        return tickFromPartialBook(coin, message.data, exchangeSlug, receivedAt)
      })

    const ticks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket).pipe(
          Effect.mapError((cause) => sourceError("binance: websocket open failed", cause))
        )

        yield* subscribe(initial)

        return Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("binance: websocket read failed", cause)))
        ).pipe(
          Stream.flatMap((frames) => Stream.fromIterable(frames)),
          Stream.mapEffect(handleFrame),
          Stream.filter((tick): tick is CanonicalTick => tick !== null)
        )
      })
    ).pipe(Stream.interruptWhen(Deferred.await(closed)))

    return {
      subscribe,
      unsubscribe,
      ticks,
      close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)
    }
  })
