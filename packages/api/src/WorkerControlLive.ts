import {
  DomainEvents,
  Gate,
  Supervisor,
  type WorkerEvent as CrawlerWorkerEvent
} from "@lister/crawler"
import { lifecycleTypes } from "@lister/crawler/events"
import { Database, exchangeTable } from "@lister/db"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer, Option, Stream } from "effect"
import {
  ExchangeDirectory,
  WorkerConflict,
  WorkerControl,
  WorkerControlFailure,
  WorkerExchangeNotFound,
  type ExchangeDirectoryEntry,
  type WorkerEvent,
  type WorkerStatus
} from "./WorkerControl.ts"

/**
 * Drizzle adapter for {@link ExchangeDirectory}.
 */
export const exchangeDirectoryLayer: Layer.Layer<ExchangeDirectory, never, Database> = Layer.effect(
  ExchangeDirectory,
  Effect.gen(function*() {
    const { db } = yield* Database

    const list = Effect.gen(function*() {
      const rows = yield* db
        .select({ exchangeId: exchangeTable.id, exchangeSlug: exchangeTable.slug })
        .from(exchangeTable)
        .orderBy(asc(exchangeTable.id))
        .pipe(Effect.orDie)

      return rows.map((row): ExchangeDirectoryEntry => ({
        exchangeId: row.exchangeId,
        exchangeSlug: row.exchangeSlug
      }))
    }).pipe(Effect.withSpan("ExchangeDirectory.list"))

    const find = Effect.fn("ExchangeDirectory.find")(function*(exchangeId: number) {
      const rows = yield* db
        .select({ exchangeId: exchangeTable.id, exchangeSlug: exchangeTable.slug })
        .from(exchangeTable)
        .where(eq(exchangeTable.id, exchangeId))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.map(Option.fromIterable(rows), (row): ExchangeDirectoryEntry => ({
        exchangeId: row.exchangeId,
        exchangeSlug: row.exchangeSlug
      }))
    })

    return ExchangeDirectory.of({ list, find })
  })
)

/**
 * Live {@link WorkerControl} layer backed by the crawler {@link Gate}.
 *
 * Start and stop route through the coordinator, which owns the desired set and
 * the two-exchange policy: a lone started exchange stays resident and idle
 * (running, zero subscribed) until a second exchange opens the gate. A request
 * that is already satisfied is rejected with a conflict before any supervisor
 * call, so no duplicate process is spawned and no lifecycle event is emitted.
 * Unknown exchanges fail with the not-found error. Status reports the desired
 * state from the gate and the subscribed-coin count from the supervisor
 * snapshot; the event stream replays and forwards the supervisor's lifecycle
 * events.
 */
export const layerLive: Layer.Layer<
  WorkerControl,
  never,
  Supervisor | DomainEvents | Gate | ExchangeDirectory
> = Layer.effect(
  WorkerControl,
  Effect.gen(function*() {
    const supervisor = yield* Supervisor
    const domainEvents = yield* DomainEvents
    const gate = yield* Gate
    const directory = yield* ExchangeDirectory

    const statusOf = (entry: ExchangeDirectoryEntry): Effect.Effect<WorkerStatus> =>
      Effect.gen(function*() {
        const snapshot = yield* supervisor.snapshot
        const exchange = snapshot.find((candidate) => candidate.exchangeId === entry.exchangeId)
        const desired = yield* gate.isDesired(entry.exchangeId)
        const shards = exchange?.shards ?? []

        return {
          exchangeId: entry.exchangeId,
          exchangeSlug: entry.exchangeSlug,
          desired: desired ? "started" : "stopped",
          running: exchange !== undefined,
          shards: shards.map((shard) => ({
            shardId: shard.shardId,
            size: shard.coins.length,
            restarts: shard.restarts,
            phase: shard.phase,
            attempt: shard.attempt,
            lastTickAt: shard.lastTickAt
          })),
          restarts: shards.reduce((total, shard) => total + shard.restarts, 0),
          subscribedCoins: shards.reduce((total, shard) => total + shard.coins.length, 0)
        }
      })

    const start = Effect.fn("WorkerControl.start")(function*(exchangeId: number) {
      const entry = yield* directory.find(exchangeId)

      if (Option.isNone(entry)) {
        return yield* new WorkerExchangeNotFound({ exchangeId })
      }

      if (yield* gate.isDesired(exchangeId)) {
        return yield* new WorkerConflict({
          exchangeId,
          action: "start",
          message: "worker is already running"
        })
      }

      yield* gate.start(exchangeId, entry.value.exchangeSlug).pipe(
        Effect.catchTags({
          SupervisorConflict: () =>
            new WorkerConflict({ exchangeId, action: "start", message: "worker is already running" }),
          SupervisorSpawnError: (error) =>
            new WorkerControlFailure({ exchangeId, message: error.message })
        })
      )

      return yield* statusOf(entry.value)
    })

    const stop = Effect.fn("WorkerControl.stop")(function*(exchangeId: number) {
      const entry = yield* directory.find(exchangeId)

      if (Option.isNone(entry)) {
        return yield* new WorkerExchangeNotFound({ exchangeId })
      }

      if (!(yield* gate.isDesired(exchangeId))) {
        return yield* new WorkerConflict({
          exchangeId,
          action: "stop",
          message: "worker is not running"
        })
      }

      yield* gate.stop(exchangeId)

      return yield* statusOf(entry.value)
    })

    const statuses = Effect.gen(function*() {
      const entries = yield* directory.list

      return yield* Effect.forEach(entries, statusOf)
    })

    const events = domainEvents.subscribe.pipe(
      Stream.filter((event): event is CrawlerWorkerEvent => lifecycleTypes.has(event.type)),
      Stream.map((event): WorkerEvent => {
        const output: WorkerEvent = {
          type: event.type,
          exchangeId: event.exchangeId,
          exchangeSlug: event.exchangeSlug,
          shardId: event.shardId,
          message: event.message,
          at: event.at
        }

        return event.attempt === undefined ? output : { ...output, attempt: event.attempt }
      })
    )

    return WorkerControl.of({
      start,
      stop,
      statuses,
      events
    })
  })
)
