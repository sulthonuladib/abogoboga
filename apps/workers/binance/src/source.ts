import { BunSocket } from "@effect/platform-bun"
import {
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory,
  WorkerSourceError
} from "@lister/worker-contract"
import { Clock, Deferred, Effect, Option, Queue, Ref, Schema, Stream } from "effect"
import * as Socket from "effect/unstable/socket/Socket"

import {
  ControlRequest,
  DepthSnapshot,
  DepthUpdateEvent,
  normalizeSymbol,
  restBaseUrl,
  snapshotLimit,
  streamNameFor,
  wsUrl
} from "./binance.ts"
import {
  applyEvent,
  applySnapshot,
  emptyBook,
  tickFor,
  type LocalBook
} from "./orderbook.ts"

/**
 * Maximum depth levels emitted per side on every tick. The crawl only needs
 * enough depth to reach the IDR executable target, so a bounded top-of-book
 * keeps stdout small while the local book itself stays deep.
 */
const emitDepth = 50

/**
 * Maximum snapshot re-fetches when a snapshot lands behind the buffered deltas.
 */
const maxSnapshotAttempts = 3

/**
 * Build a worker source failure with an optional underlying cause.
 *
 * @param message - One-line failure description.
 * @param cause - Optional underlying defect.
 */
const sourceError = (message: string, cause?: unknown): WorkerSourceError =>
  new WorkerSourceError({ message, cause })

/**
 * Replace one book in the subscription map immutably.
 */
const setBook = (
  map: ReadonlyMap<string, LocalBook>,
  symbol: string,
  book: LocalBook
): ReadonlyMap<string, LocalBook> => {
  const next = new Map(map)

  next.set(symbol, book)

  return next
}

/**
 * Parse one WebSocket text frame into a depth update, ignoring control
 * messages (subscribe acks) and malformed payloads.
 *
 * @param frame - Raw JSON frame.
 */
const parseFrame = (frame: string): DepthUpdateEvent | null => {
  let raw: unknown

  try {
    raw = JSON.parse(frame)
  } catch {
    return null
  }

  return Option.getOrNull(Schema.decodeUnknownOption(DepthUpdateEvent)(raw))
}

/**
 * binance worker owner hook.
 *
 * Keeps one raw WebSocket (`/ws`) open and uses live `SUBSCRIBE`/`UNSUBSCRIBE`
 * control messages so the subscription set follows the host's stdin commands.
 * Each subscribed pair maintains a local order book: a REST snapshot seeds it
 * and diff-depth updates keep it current, with the standard Binance
 * gap/staleness rules driving resynchronization.
 *
 * - `initial` seeds the subscription set at boot.
 * - `subscribe`/`unsubscribe` mutate that set live.
 * - every `ticks` value is a `CanonicalTick`; the host writes each as one JSON
 *   line on stdout.
 */
export const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    const exchangeSlug = context.exchangeSlug

    // Normalized pair symbol → local book.
    const books = yield* Ref.make<ReadonlyMap<string, LocalBook>>(new Map())
    // Snapshot-derived ticks (subscribe/resync), merged into `ticks` below.
    const snapshotTicks = yield* Queue.unbounded<CanonicalTick>()
    // Monotonic id for SUBSCRIBE/UNSUBSCRIBE control messages.
    const ids = yield* Ref.make(0)
    // Closed when the host tears the worker down; interrupts `ticks`.
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

    const fetchSnapshot = (symbol: string): Effect.Effect<DepthSnapshot, WorkerSourceError> =>
      Effect.tryPromise({
        try: () =>
          fetch(`${restBaseUrl}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${snapshotLimit}`).then(
            (response) => {
              if (!response.ok) {
                throw new Error(`depth snapshot failed with HTTP ${response.status}`)
              }

              return response.json()
            }
          ),
        catch: (cause) => sourceError(`binance: depth snapshot request failed for ${symbol}`, cause)
      }).pipe(
        Effect.flatMap((raw) =>
          Schema.decodeUnknownEffect(DepthSnapshot)(raw).pipe(
            Effect.mapError((cause) => sourceError(`binance: invalid depth snapshot for ${symbol}`, cause))
          )
        )
      )

    const loadSnapshot = (symbol: string): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        for (let attempt = 0; attempt < maxSnapshotAttempts; attempt++) {
          const snapshot = yield* fetchSnapshot(symbol)

          const outcome = yield* Ref.modify(
            books,
            (map): readonly ["gone" | "stale" | "applied", ReadonlyMap<string, LocalBook>] => {
              const book = map.get(symbol)

              if (book === undefined) return ["gone", map]

              const applied = applySnapshot(book, snapshot)

              if (applied.kind === "stale") return ["stale", map]

              return ["applied", setBook(map, symbol, applied.book)]
            }
          )

          if (outcome === "gone") return

          if (outcome === "applied") {
            const book = yield* Ref.get(books).pipe(Effect.map((m) => m.get(symbol)))

            if (book !== undefined && book.ready) {
              const millis = yield* Clock.currentTimeMillis

              yield* Queue.offer(snapshotTicks, tickFor(book, exchangeSlug, millis, emitDepth))
            }

            return
          }

          // Snapshot landed behind the buffered deltas; re-fetch and retry.
        }

        yield* Effect.logWarning(`binance: depth snapshot did not converge for ${symbol}`)
      })

    const resync = (symbol: string): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        yield* Ref.update(books, (map) => {
          const book = map.get(symbol)

          if (book === undefined) return map

          return setBook(map, symbol, { ...book, ready: false, buffer: [] })
        })

        yield* loadSnapshot(symbol)
      })

    const subscribeOne = (coin: BootstrapCoin): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const symbol = normalizeSymbol(coin.symbol)

        const registered = yield* Ref.modify(books, (map) => {
          if (map.has(symbol)) return [false as const, map]

          return [true as const, setBook(map, symbol, emptyBook(coin, symbol))]
        })

        if (!registered) return

        yield* send({ method: "SUBSCRIBE", params: [streamNameFor(symbol)], id: yield* nextId() })
        yield* loadSnapshot(symbol)
      })

    const unsubscribeOne = (coin: BootstrapCoin): Effect.Effect<void, never> =>
      Effect.gen(function*() {
        const symbol = normalizeSymbol(coin.symbol)

        yield* send({ method: "UNSUBSCRIBE", params: [streamNameFor(symbol)], id: yield* nextId() }).pipe(
          Effect.catch((error) =>
            Effect.logWarning(`binance: unsubscribe failed for ${symbol}: ${error.message ?? "unknown"}`)
          )
        )

        yield* Ref.update(books, (map) => {
          const next = new Map(map)

          next.delete(symbol)

          return next
        })
      })

    const handleFrame = (frame: string): Effect.Effect<CanonicalTick | null, WorkerSourceError> =>
      Effect.gen(function*() {
        const event = parseFrame(frame)

        if (event === null) return null

        const symbol = normalizeSymbol(event.s)

        const outcome = yield* Ref.modify(
          books,
          (map): readonly [LocalBook | "resync" | null, ReadonlyMap<string, LocalBook>] => {
            const book = map.get(symbol)

            if (book === undefined) return [null, map]

            if (!book.ready) {
              return [null, setBook(map, symbol, { ...book, buffer: [...book.buffer, event] })]
            }

            const result = applyEvent(book, event)

            if (result.kind === "ignored") return [null, map]

            if (result.kind === "resync") return ["resync", map]

            return [result.book, setBook(map, symbol, result.book)]
          }
        )

        if (outcome === null) return null

        if (outcome === "resync") {
          const book = yield* Ref.get(books).pipe(Effect.map((m) => m.get(symbol)))

          if (book !== undefined) yield* resync(symbol)

          return null
        }

        return tickFor(outcome, exchangeSlug, event.E, emitDepth)
      })

    const depthTicks = Stream.unwrap(
      Effect.gen(function*() {
        const pull = yield* Socket.readerString(socket).pipe(
          Effect.mapError((cause) => sourceError("binance: websocket open failed", cause))
        )

        yield* Effect.forEach(
          initial,
          (coin) =>
            subscribeOne(coin).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `binance: bootstrap subscribe failed for ${coin.symbol}: ${error.message ?? "unknown"}`
                )
              )
            ),
          { concurrency: "unbounded", discard: true }
        )

        return Stream.fromEffectRepeat(
          pull.pipe(Effect.mapError((cause) => sourceError("binance: websocket read failed", cause)))
        ).pipe(
          Stream.flatMap((frames) => Stream.fromIterable(frames)),
          // Depth updates must apply in order, so frames are processed sequentially.
          Stream.mapEffect(handleFrame),
          Stream.filter((tick): tick is CanonicalTick => tick !== null)
        )
      })
    )

    const ticks = Stream.merge(depthTicks, Stream.fromQueue(snapshotTicks)).pipe(
      Stream.interruptWhen(Deferred.await(closed))
    )

    return {
      subscribe: (coins) => Effect.forEach(coins, subscribeOne, { discard: true }),
      unsubscribe: (coins) => Effect.forEach(coins, unsubscribeOne, { discard: true }),
      ticks,
      close: Effect.gen(function*() {
        yield* Deferred.succeed(closed, undefined)
        yield* Queue.shutdown(snapshotTicks)
      })
    }
  })
