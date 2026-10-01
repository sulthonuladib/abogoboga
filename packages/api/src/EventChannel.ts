import { Context, Effect, Layer, PubSub, Ref, Schema, Scope, Semaphore, Stream } from "effect"
import { SignalEvent, SignalStore } from "./Signal.ts"
import { WorkerControl, WorkerStatus } from "./WorkerControl.ts"

/**
 * Every topic a client can subscribe to.
 */
export const topics = ["signal", "workers"] as const

/**
 * Every topic a client can subscribe to.
 */
export const Topic = Schema.Literals(topics)

/**
 * Every topic a client can subscribe to.
 */
export type Topic = typeof Topic.Type

/**
 * The `workers` server event: a complete snapshot of every exchange worker's
 * status.
 *
 * The snapshot is self-contained, so a client applies it without a request and
 * without reconciling against a previous event. `seq` is a monotonically
 * increasing per-process counter: an event with a lower sequence than one
 * already applied is stale and can be discarded, which closes the gap between
 * reading a snapshot and attaching to the live stream.
 */
export const WorkersEvent = Schema.Struct({
  type: Schema.Literal("workers"),
  seq: Schema.Int,
  workers: Schema.Array(WorkerStatus)
})

/**
 * The `workers` server event: a complete snapshot of every exchange worker's
 * status.
 */
export type WorkersEvent = typeof WorkersEvent.Type

/**
 * Every message the server pushes to a subscribed client.
 *
 * The union is discriminated on `type`; adding a later event type is one more
 * member, not a protocol change. It lives beside `topics` because it is a
 * property of the socket, not of any single topic.
 */
export const ServerEvent = Schema.Union([SignalEvent, WorkersEvent])

/**
 * Every message the server pushes to a subscribed client.
 */
export type ServerEvent = typeof ServerEvent.Type

/**
 * Whether a server event belongs to the `signal` topic.
 */
export const isSignalEvent = (event: ServerEvent): event is SignalEvent => event.type === "signal"

/**
 * Whether a server event belongs to the `workers` topic.
 */
export const isWorkersEvent = (event: ServerEvent): event is WorkersEvent => event.type === "workers"

/**
 * A client's request to start receiving a topic's events.
 */
export const SubscribeFrame = Schema.Struct({
  type: Schema.Literal("subscribe"),
  topic: Topic
})

/**
 * A client's request to start receiving a topic's events.
 */
export type SubscribeFrame = typeof SubscribeFrame.Type

/**
 * A client's request to stop receiving a topic's events.
 */
export const UnsubscribeFrame = Schema.Struct({
  type: Schema.Literal("unsubscribe"),
  topic: Topic
})

/**
 * A client's request to stop receiving a topic's events.
 */
export type UnsubscribeFrame = typeof UnsubscribeFrame.Type

/**
 * Every frame a client may send to the event socket.
 */
export const ClientFrame = Schema.Union([SubscribeFrame, UnsubscribeFrame])

/**
 * Every frame a client may send to the event socket.
 */
export type ClientFrame = typeof ClientFrame.Type

/**
 * In-process topic hub for server-pushed events.
 *
 * A subscription is a stream whose lifetime is the subscription: the count for
 * a topic rises while a stream is running and falls when it ends, including on
 * interruption. A publish reaches only the subscribers present at that moment,
 * so a topic with no subscribers has nothing buffered to receive later.
 */
export type EventChannelService = {
  /** Stream a topic's events, counted for as long as the stream runs. */
  readonly subscribe: (topic: Topic) => Stream.Stream<ServerEvent>
  /** Attach to a topic now and hand back its subscription; the count rises for the scope's lifetime. */
  readonly subscribeScoped: (
    topic: Topic
  ) => Effect.Effect<PubSub.Subscription<ServerEvent>, never, Scope.Scope>
  /** Fan an event out to a topic's current subscribers. */
  readonly publish: (topic: Topic, event: ServerEvent) => Effect.Effect<void>
  /** The number of live subscribers for a topic. */
  readonly count: (topic: Topic) => Effect.Effect<number>
}

/**
 * In-process topic hub for server-pushed events.
 */
export class EventChannel extends Context.Service<EventChannel, EventChannelService>()(
  "lister/control-plane-api/EventChannel"
) {
  /**
   * A hub backed by one unbounded `PubSub` per topic and a per-topic count.
   */
  static readonly layer: Layer.Layer<EventChannel> = Layer.effect(
    EventChannel,
    Effect.gen(function*() {
      const entries = yield* Effect.forEach(
        topics,
        (topic) =>
          Effect.map(
            PubSub.unbounded<ServerEvent>(),
            (pubsub) => [topic, pubsub] as const
          )
      )

      const pubsubs = new Map(entries)
      const counts = yield* Ref.make(new Map<Topic, number>(topics.map((topic) => [topic, 0])))

      const bump = (topic: Topic, delta: number): Effect.Effect<void> =>
        Ref.update(counts, (current) =>
          new Map(current).set(topic, (current.get(topic) ?? 0) + delta))

      const publish = (topic: Topic, event: ServerEvent): Effect.Effect<void> =>
        PubSub.publish(pubsubs.get(topic)!, event)

      const count = (topic: Topic): Effect.Effect<number> =>
        Effect.map(Ref.get(counts), (current) => current.get(topic) ?? 0)

      const subscribeScoped = (
        topic: Topic
      ): Effect.Effect<PubSub.Subscription<ServerEvent>, never, Scope.Scope> =>
        Effect.acquireRelease(
          Effect.gen(function*() {
            const subscription = yield* PubSub.subscribe(pubsubs.get(topic)!)

            yield* bump(topic, 1)

            return subscription
          }),
          () => bump(topic, -1)
        )

      const subscribe = (topic: Topic): Stream.Stream<ServerEvent> =>
        Stream.unwrap(Effect.map(subscribeScoped(topic), Stream.fromSubscription))

      return EventChannel.of({ subscribe, subscribeScoped, publish, count })
    })
  )
}

/**
 * How often the projector pushes a fresh snapshot while a topic is subscribed.
 */
export const signalTickInterval = "1 seconds"

/**
 * The signal projector: one snapshot per tick, but only while `signal` has a
 * subscriber.
 *
 * `start` is the shared loop. `subscribe` emits the current snapshot before the
 * live stream, so a late subscriber sees data without waiting for a tick.
 */
export type SignalProjectorService = {
  /** The current snapshot followed by live signal events. */
  readonly subscribe: Stream.Stream<SignalEvent>
  /** The projection loop; runs until interrupted. */
  readonly start: Effect.Effect<never>
  /** Project once and return the snapshot event. */
  readonly snapshot: Effect.Effect<SignalEvent>
}

/**
 * The signal projector: one snapshot per tick, but only while `signal` has a
 * subscriber.
 */
export class SignalProjector extends Context.Service<SignalProjector, SignalProjectorService>()(
  "lister/control-plane-api/SignalProjector"
) {
  /**
   * A projector over the {@link SignalStore} projection and the {@link EventChannel} hub.
   */
  static readonly layer: Layer.Layer<SignalProjector, never, EventChannel | SignalStore> = Layer.effect(
    SignalProjector,
    Effect.gen(function*() {
      const channel = yield* EventChannel
      const store = yield* SignalStore

      const snapshot: Effect.Effect<SignalEvent> = store.project.pipe(
        Effect.map((rows) => SignalEvent.make({ type: "signal", rows }))
      )

      const publishSnapshot = Effect.flatMap(snapshot, (event) => channel.publish("signal", event))

      const start = Effect.forever(
        Effect.flatMap(
          Effect.sleep(signalTickInterval),
          () =>
            Effect.flatMap(channel.count("signal"), (subscribers) =>
              subscribers > 0 ? publishSnapshot : Effect.void)
        )
      )

      const subscribe = Stream.unwrap(
        Effect.gen(function*() {
          const current = yield* snapshot
          const live = channel.subscribe("signal").pipe(Stream.filter(isSignalEvent))

          return Stream.concat(Stream.succeed(current), live)
        })
      )

      return SignalProjector.of({ subscribe, start, snapshot })
    })
  )
}

/**
 * The workers projector: a fresh full snapshot per worker lifecycle event, but
 * only while `workers` has a subscriber.
 *
 * The crawler publishes a lifecycle event for every status the page renders,
 * including a shard's phase reaching `running` after a reconnect, so the
 * event-driven loop stays current with no refresh tick. `subscribe` emits the
 * current snapshot before the live stream, so a newly opened page shows present
 * state without waiting for a transition.
 */
export type WorkersProjectorService = {
  /** The current snapshot followed by live worker events. */
  readonly subscribe: Stream.Stream<WorkersEvent>
  /** The projection loop; runs until interrupted. */
  readonly start: Effect.Effect<never>
  /** Project once and return the snapshot event. */
  readonly snapshot: Effect.Effect<WorkersEvent>
}

/**
 * The workers projector: a fresh full snapshot per worker lifecycle event, but
 * only while `workers` has a subscriber.
 */
export class WorkersProjector extends Context.Service<WorkersProjector, WorkersProjectorService>()(
  "lister/control-plane-api/WorkersProjector"
) {
  /**
   * A projector over the {@link WorkerControl} status and the {@link EventChannel} hub.
   */
  static readonly layer: Layer.Layer<WorkersProjector, never, EventChannel | WorkerControl> = Layer.effect(
    WorkersProjector,
    Effect.gen(function*() {
      const channel = yield* EventChannel
      const control = yield* WorkerControl
      const sequence = yield* Ref.make(0)
      const gate = yield* Semaphore.make(1)

      const project = (seq: number): Effect.Effect<WorkersEvent> =>
        Effect.map(
          control.statuses,
          (workers) => WorkersEvent.make({ type: "workers", seq, workers })
        )

      // A published snapshot and the one handed to a new subscriber both take
      // the gate, so a snapshot's sequence and the state it reports are read
      // together: every event whose sequence is at or below the snapshot's
      // carries no state newer than the snapshot does.
      const snapshot: Effect.Effect<WorkersEvent> = gate.withPermits(1)(
        Effect.gen(function*() {
          const seq = yield* Ref.get(sequence)

          return yield* project(seq)
        })
      )

      const publishSnapshot: Effect.Effect<void> = gate.withPermits(1)(
        Effect.gen(function*() {
          const seq = yield* Ref.updateAndGet(sequence, (current) => current + 1)
          const event = yield* project(seq)

          yield* channel.publish("workers", event)
        })
      )

      const publishIfSubscribed = Effect.flatMap(channel.count("workers"), (subscribers) =>
        subscribers > 0 ? publishSnapshot : Effect.void
      )

      const start: Effect.Effect<never> = control.events.pipe(
        Stream.mapEffect(() => publishIfSubscribed),
        Stream.runDrain,
        Effect.flatMap(() => Effect.never)
      )

      const subscribe = Stream.unwrap(
        Effect.gen(function*() {
          // Attach before reading the snapshot so an event published in between
          // is buffered rather than lost. The sequence then orders the two: a
          // buffered event at or before the snapshot's sequence is stale and is
          // dropped, and one after it is newer and is forwarded.
          const live = yield* channel.subscribeScoped("workers")
          const current = yield* snapshot

          return Stream.concat(
            Stream.succeed(current),
            Stream.fromSubscription(live).pipe(
              Stream.filter(isWorkersEvent),
              Stream.filter((event) => event.seq > current.seq)
            )
          )
        })
      )

      return WorkersProjector.of({ subscribe, start, snapshot })
    })
  )
}
