import { Context, Effect, Layer, Option, PubSub, Ref, Schema, Stream } from "effect"

/**
 * Per-shard state shown on the worker monitoring page.
 */
export const WorkerShardStatus = Schema.Struct({
  shardId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64))),
  size: Schema.Int,
  restarts: Schema.Int,
  pid: Schema.NullOr(Schema.Int)
})

/**
 * Per-shard state shown on the worker monitoring page.
 */
export type WorkerShardStatus = typeof WorkerShardStatus.Type

/**
 * Per-exchange worker status: desired versus actual state plus shard detail.
 */
export const WorkerStatus = Schema.Struct({
  exchangeId: Schema.Int,
  exchangeSlug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  desired: Schema.Literals(["started", "stopped"]),
  running: Schema.Boolean,
  shards: Schema.Array(WorkerShardStatus),
  restarts: Schema.Int,
  eligibleCoins: Schema.Int
})

/**
 * Per-exchange worker status: desired versus actual state plus shard detail.
 */
export type WorkerStatus = typeof WorkerStatus.Type

/**
 * Worker lifecycle event kinds emitted on the monitoring stream.
 */
export const WorkerEventType = Schema.Literals([
  "started",
  "stopped",
  "shard-spawned",
  "shard-exited",
  "respawn-scheduled",
  "reconciled"
])

/**
 * One worker lifecycle event as delivered to monitoring clients.
 */
export const WorkerEvent = Schema.Struct({
  type: WorkerEventType,
  exchangeId: Schema.Int,
  exchangeSlug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  shardId: Schema.NullOr(Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64)))),
  message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024))),
  at: Schema.Int
})

/**
 * One worker lifecycle event as delivered to monitoring clients.
 */
export type WorkerEvent = typeof WorkerEvent.Type

/**
 * Expected failure: the requested start/stop transition is already satisfied.
 *
 * A rejected request changes no state and emits no event, so a monitoring
 * client never observes a duplicate lifecycle transition.
 */
export class WorkerConflict extends Schema.TaggedError<WorkerConflict>()(
  "WorkerConflict",
  {
    exchangeId: Schema.Int,
    action: Schema.Literals(["start", "stop"]),
    message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024)))
  },
  { httpApiStatus: 409 }
) {}

/**
 * Expected failure: the exchange id does not exist.
 */
export class WorkerExchangeNotFound extends Schema.TaggedError<WorkerExchangeNotFound>()(
  "WorkerExchangeNotFound",
  {
    exchangeId: Schema.Int
  },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: the supervisor could not satisfy a start/stop transition.
 */
export class WorkerControlFailure extends Schema.TaggedError<WorkerControlFailure>()(
  "WorkerControlFailure",
  {
    exchangeId: Schema.Int,
    message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024)))
  },
  { httpApiStatus: 500 }
) {}

/**
 * Worker control-plane port.
 *
 * Implemented at the composition root over the crawler `Supervisor`; the JSON
 * API and the SSR monitoring page consume this port so tests can substitute an
 * in-memory implementation without spawning subprocesses.
 */
export type WorkerControlService = {
  /** Start the worker for an exchange, or fail with a conflict when already started. */
  readonly start: (exchangeId: number) => Effect.Effect<WorkerStatus, WorkerConflict | WorkerExchangeNotFound | WorkerControlFailure>
  /** Stop the worker for an exchange, or fail with a conflict when already stopped. */
  readonly stop: (exchangeId: number) => Effect.Effect<WorkerStatus, WorkerConflict | WorkerExchangeNotFound | WorkerControlFailure>
  /** Status for every known exchange, running or not. */
  readonly statuses: Effect.Effect<ReadonlyArray<WorkerStatus>>
  /** Recent worker lifecycle events followed by live events. */
  readonly events: Stream.Stream<WorkerEvent>
}

/**
 * One exchange known to the control plane.
 */
export interface ExchangeDirectoryEntry {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Exchange slug used in worker argv and monitoring rows. */
  readonly exchangeSlug: string
}

/**
 * Persistence port listing the exchanges the control plane can manage.
 */
export type ExchangeDirectoryService = {
  /** Every known exchange, in stable order. */
  readonly list: () => Effect.Effect<ReadonlyArray<ExchangeDirectoryEntry>>
  /** Look up one exchange, or `None` when the id does not exist. */
  readonly find: (exchangeId: number) => Effect.Effect<Option.Option<ExchangeDirectoryEntry>>
}

/**
 * Persistence port listing manageable exchanges.
 */
export class ExchangeDirectory extends Context.Service<ExchangeDirectory, ExchangeDirectoryService>()(
  "lister/control-plane-api/ExchangeDirectory"
) {}

/**
 * Worker control-plane port.
 *
 * Implemented at the composition root over the crawler `Supervisor`; the JSON
 * API and the SSR monitoring page consume this port so tests can substitute an
 * in-memory implementation without spawning subprocesses.
 */
export class WorkerControl extends Context.Service<WorkerControl, WorkerControlService>()(
  "lister/control-plane-api/WorkerControl"
) {
  /**
   * Build an in-memory {@link WorkerControl} layer for tests.
   *
   * The fake keeps running state per exchange, folds transitions into the
   * conflict semantics, and fans events out through a replay buffer, so route
   * tests exercise the real handler decisions without subprocesses.
   *
   * @param exchanges - Known exchanges (id and slug) for the fake registry.
   * @returns A layer providing the in-memory port.
   */
  static readonly layerTest = (
    exchanges: ReadonlyArray<{ readonly id: number, readonly slug: string }>
  ): Layer.Layer<WorkerControl> =>
    Layer.effect(
      WorkerControl,
      Effect.gen(function*() {
        const state = yield* Ref.make(
          new Map<number, { readonly slug: string, readonly running: boolean, readonly restarts: number }>(
            exchanges.map((exchange) => [exchange.id, { slug: exchange.slug, running: false, restarts: 0 }])
          )
        )

        const hub = yield* PubSub.bounded<WorkerEvent>(64)
        const history = yield* Ref.make<ReadonlyArray<WorkerEvent>>([])

        const publish = Effect.fnUntraced(function*(event: WorkerEvent) {
          yield* PubSub.publish(hub, event)
          yield* Ref.update(history, (events) => [...events.slice(-99), event])
        })

        const snapshot = Effect.fnUntraced(function*(exchangeId: number) {
          const current = yield* Ref.get(state)
          const entry = current.get(exchangeId)

          if (entry === undefined) return undefined

          return {
            exchangeId,
            exchangeSlug: entry.slug,
            desired: entry.running ? ("started" as const) : ("stopped" as const),
            running: entry.running,
            shards: entry.running
              ? [{ shardId: `${entry.slug}-shard-1`, size: 1, restarts: entry.restarts, pid: 4242 }]
              : [],
            restarts: entry.restarts,
            eligibleCoins: entry.running ? 2 : 0
          }
        })

        const transition = Effect.fnUntraced(function*(action: "start" | "stop", exchangeId: number) {
          const current = yield* Ref.get(state)
          const entry = current.get(exchangeId)

          if (entry === undefined) {
            return yield* new WorkerExchangeNotFound({ exchangeId })
          }

          if (action === "start" && entry.running) {
            return yield* new WorkerConflict({ exchangeId, action, message: "worker is already running" })
          }

          if (action === "stop" && !entry.running) {
            return yield* new WorkerConflict({ exchangeId, action, message: "worker is not running" })
          }

          const next = new Map(current)

          next.set(exchangeId, { slug: entry.slug, running: action === "start", restarts: entry.restarts })

          yield* Ref.set(state, next)
          yield* publish({
            type: action === "start" ? "started" : "stopped",
            exchangeId,
            exchangeSlug: entry.slug,
            shardId: null,
            message: `worker ${action === "start" ? "started" : "stopped"}`,
            at: 0
          })

          const status = yield* snapshot(exchangeId)

          if (status === undefined) {
            return yield* new WorkerExchangeNotFound({ exchangeId })
          }

          return status
        })

        const statuses = Effect.fnUntraced(function*() {
          const current = yield* Ref.get(state)
          const out: Array<WorkerStatus> = []

          for (const exchangeId of current.keys()) {
            const status = yield* snapshot(exchangeId)

            if (status !== undefined) out.push(status)
          }

          return out
        })

        const events = Stream.unwrap(
          Effect.gen(function*() {
            const past = yield* Ref.get(history)

            return Stream.concat(Stream.fromIterable(past), Stream.fromPubSub(hub))
          })
        )

        return WorkerControl.of({
          start: (exchangeId: number) => transition("start", exchangeId),
          stop: (exchangeId: number) => transition("stop", exchangeId),
          statuses: statuses(),
          events
        })
      })
    )
}
