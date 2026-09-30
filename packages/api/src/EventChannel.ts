import { Context, Effect, Layer, PubSub, Ref, Schema, Stream } from "effect"
import { ServerEvent, SignalEvent, SignalStore } from "./Signal.ts"

/**
 * Every topic a client can subscribe to.
 */
export const topics = ["signal"] as const

/**
 * Every topic a client can subscribe to.
 */
export const Topic = Schema.Literals(topics)

/**
 * Every topic a client can subscribe to.
 */
export type Topic = typeof Topic.Type

/**
 * Whether a server event belongs to the `signal` topic.
 */
export const isSignalEvent = (event: ServerEvent): event is SignalEvent => event.type === "signal"

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

      const subscribe = (topic: Topic): Stream.Stream<ServerEvent> =>
        Stream.fromPubSub(pubsubs.get(topic)!).pipe(
          Stream.onStart(bump(topic, 1)),
          Stream.ensuring(bump(topic, -1))
        )

      return EventChannel.of({ subscribe, publish, count })
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
