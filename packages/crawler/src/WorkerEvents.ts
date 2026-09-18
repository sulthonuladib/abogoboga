import { Clock, Context, Effect, Layer, PubSub, Ref, Schema, Semaphore, Stream } from "effect"

/**
 * Kind of worker lifecycle event published on the supervision stream.
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
 * Kind of worker lifecycle event published on the supervision stream.
 */
export type WorkerEventType = typeof WorkerEventType.Type

/**
 * One worker lifecycle event, stamped with the publishing clock time.
 */
export const WorkerEvent = Schema.Struct({
  type: WorkerEventType,
  exchangeId: Schema.Int,
  exchangeSlug: Schema.String,
  shardId: Schema.NullOr(Schema.String),
  message: Schema.String,
  at: Schema.Int
})

/**
 * One worker lifecycle event, stamped with the publishing clock time.
 */
export type WorkerEvent = typeof WorkerEvent.Type

/**
 * Operator intent to start or stop the worker for one exchange.
 *
 * The payload carries identity only; subscription state is always recomputed
 * from the database by the reconciler.
 */
export const WorkerChanged = Schema.Struct({
  type: Schema.Literal("worker-changed"),
  exchangeId: Schema.Int,
  action: Schema.Literals(["start", "stop"])
})

/**
 * Operator intent to start or stop the worker for one exchange.
 */
export type WorkerChanged = typeof WorkerChanged.Type

/**
 * A market mapping or chain link changed, so eligibility must be recomputed.
 */
export const CoinDetailChanged = Schema.Struct({
  type: Schema.Literal("coin-detail-changed"),
  exchangeId: Schema.Int,
  exchangeCryptocurrencyId: Schema.Int,
  cryptocurrencyId: Schema.Int
})

/**
 * A market mapping or chain link changed, so eligibility must be recomputed.
 */
export type CoinDetailChanged = typeof CoinDetailChanged.Type

/**
 * Every in-process domain event the crawler services produce or consume.
 */
export const DomainEvent = Schema.Union([WorkerEvent, WorkerChanged, CoinDetailChanged])

/**
 * Every in-process domain event the crawler services produce or consume.
 */
export type DomainEvent = typeof DomainEvent.Type

/**
 * Lifecycle events retained for replay to late subscribers.
 */
export const DomainEventsHistorySize = 256

const DomainEventsCapacity = 1024

/**
 * Build a lifecycle event stamped with the current clock time.
 *
 * Uses `Clock.currentTimeMillis`, so `TestClock` fully controls the timestamp.
 *
 * @param input - The event fields except `at`.
 * @returns The event with its `at` timestamp filled in.
 */
export const makeWorkerEvent = (input: Omit<WorkerEvent, "at">): Effect.Effect<WorkerEvent> =>
  Effect.map(Clock.currentTimeMillis, (at) => ({ ...input, at }))

/**
 * In-process fan-out for crawler domain events.
 *
 * `publish` fans out to live subscribers and appends to a bounded history;
 * `subscribe` replays that history in order before continuing live. A publish
 * never fails and never blocks on a slow subscriber.
 */
export class DomainEvents extends Context.Service<DomainEvents, {
  /** Publish one domain event; never fails, drops only when saturated. */
  readonly publish: (event: DomainEvent) => Effect.Effect<void>
  /** Replay recent events, then continue with live events. */
  readonly subscribe: () => Stream.Stream<DomainEvent>
}>()("lister/crawler/DomainEvents") {
  /**
   * Layer backed by a bounded `PubSub` plus a `Ref` replay history.
   *
   * History and subscription are read under one permit, so a subscriber never
   * observes a gap or a duplicate around the replay/live boundary.
   */
  static readonly layer: Layer.Layer<DomainEvents> = Layer.effect(
    DomainEvents,
    Effect.gen(function*() {
      const pubsub = yield* PubSub.bounded<DomainEvent>(DomainEventsCapacity)
      const history = yield* Ref.make<ReadonlyArray<DomainEvent>>([])
      const gate = yield* Semaphore.make(1)

      const publish = Effect.fnUntraced(
        function*(event: DomainEvent) {
          yield* gate.withPermits(1)(
            Effect.gen(function*() {
              PubSub.publishUnsafe(pubsub, event)
              yield* Ref.update(history, (events) => [...events.slice(1 - DomainEventsHistorySize), event])
            })
          )
        },
        Effect.catchCause((cause) => Effect.logError("domain event publish failed", cause))
      )

      const subscribe = (): Stream.Stream<DomainEvent> =>
        Stream.unwrap(
          gate.withPermits(1)(
            Effect.gen(function*() {
              const past = yield* Ref.get(history)
              const subscription = yield* PubSub.subscribe(pubsub)

              return Stream.concat(Stream.fromIterable(past), Stream.fromSubscription(subscription))
            })
          )
        )

      return DomainEvents.of({ publish, subscribe })
    })
  )
}
