import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer, Option, PubSub, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import {
  EventChannel,
  type EventChannelService,
  SignalProjector,
  WorkersEvent,
  WorkersProjector,
  isWorkersEvent
} from "./EventChannel.ts"
import { SignalEvent, SignalRow, SignalStore } from "./Signal.ts"
import { WorkerControl, type WorkerEvent, type WorkerStatus } from "./WorkerControl.ts"

const row: SignalRow = {
  opportunityId: 1,
  symbol: "BTC",
  buyExchangeId: 2,
  buyExchangeSymbol: "BTC/IDR",
  buyPrice: 1_000_000,
  buyVolume: 2,
  buyTickTimestamp: 1,
  sellExchangeId: 3,
  sellExchangeSymbol: "BTC/USDT",
  sellPrice: 1_100_000,
  sellVolume: 3,
  sellTickTimestamp: 2,
  profitPercent: 10,
  profitVolume: 0.2
}

const fakeStore = (
  counter: Ref.Ref<number>,
  rows: ReadonlyArray<SignalRow>
): Layer.Layer<SignalStore> =>
  Layer.succeed(
    SignalStore,
    SignalStore.of({
      project: Ref.updateAndGet(counter, (count) => count + 1).pipe(Effect.as(rows))
    })
  )

describe("EventChannel", () => {
  test("a topic with no subscribers holds nothing to receive later", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const channel = yield* EventChannel
        const before = yield* channel.count("signal")

        yield* channel.publish("signal", SignalEvent.make({ type: "signal", rows: [] }))

        const received = yield* channel.subscribe("signal").pipe(
          Stream.take(1),
          Stream.runHead,
          Effect.timeoutOption("20 millis")
        )

        const after = yield* channel.count("signal")

        return { before, received, after }
      }).pipe(Effect.provide(EventChannel.layer), Effect.scoped)
    )

    expect(result.before).toBe(0)
    expect(Option.isNone(result.received)).toBe(true)
    expect(result.after).toBe(0)
  })
})

describe("SignalProjector", () => {
  test("runs no query without a subscriber and one per tick with one", async () => {
    const counter = Ref.makeUnsafe(0)
    const shared = Layer.mergeAll(EventChannel.layer, fakeStore(counter, [row]))

    const dependencies = Layer.mergeAll(
      shared,
      SignalProjector.layer.pipe(Layer.provide(shared)),
      TestClock.layer()
    )

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* SignalProjector
        const channel = yield* EventChannel

        const loop = yield* Effect.forkChild(projector.start)

        yield* TestClock.adjust("1 seconds")
        const idle = yield* Ref.get(counter)

        const consumer = yield* Effect.forkChild(channel.subscribe("signal").pipe(Stream.runDrain))

        yield* TestClock.adjust("1 seconds")
        const afterFirstTick = yield* Ref.get(counter)

        yield* TestClock.adjust("1 seconds")
        const afterSecondTick = yield* Ref.get(counter)

        yield* Fiber.interrupt(consumer)
        yield* Fiber.interrupt(loop)

        return { idle, afterFirstTick, afterSecondTick }
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result.idle).toBe(0)
    expect(result.afterFirstTick).toBe(1)
    expect(result.afterSecondTick).toBe(2)
  })

  test("emits the current snapshot on subscribe before any tick", async () => {
    const counter = Ref.makeUnsafe(0)
    const shared = Layer.mergeAll(EventChannel.layer, fakeStore(counter, [row]))

    const dependencies = Layer.mergeAll(
      shared,
      SignalProjector.layer.pipe(Layer.provide(shared)),
      TestClock.layer()
    )

    const event = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* SignalProjector

        return yield* projector.subscribe.pipe(Stream.take(1), Stream.runHead)
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(Option.isSome(event)).toBe(true)
    expect(Option.getOrThrow(event).type).toBe("signal")
    expect(Option.getOrThrow(event).rows).toEqual([row])
  })
})

const workerStatus: WorkerStatus = {
  exchangeId: 1,
  exchangeSlug: "binance",
  desired: "started",
  running: true,
  shards: [],
  restarts: 0,
  subscribedCoins: 0
}

const lifecycle: WorkerEvent = {
  type: "started",
  exchangeId: 1,
  exchangeSlug: "binance",
  shardId: null,
  message: "worker started",
  at: 0
}

const fakeControl = () => {
  const counter = Ref.makeUnsafe(0)
  const hub = Effect.runSync(PubSub.unbounded<WorkerEvent>())

  return {
    counter,
    hub,
    layer: Layer.succeed(
      WorkerControl,
      WorkerControl.of({
        start: () => Effect.die("start is not used"),
        stop: () => Effect.die("stop is not used"),
        statuses: Ref.updateAndGet(counter, (count) => count + 1).pipe(Effect.as([workerStatus])),
        events: Stream.fromPubSub(hub)
      })
    )
  }
}

const waitForCount = (
  channel: EventChannelService,
  topic: "workers",
  expected: number
): Effect.Effect<void> =>
  Effect.gen(function*() {
    let attempts = 0

    while ((yield* channel.count(topic)) !== expected) {
      if (attempts > 500) {
        return yield* Effect.die(new Error(`subscriber count did not reach ${expected}`))
      }

      attempts++
      yield* Effect.sleep("1 millis")
    }
  })

/**
 * The projector's own environment plus the hub it shares with it, so a test can
 * count subscribers on the same `EventChannel` instance.
 */
const projectorDependencies = (
  control: ReturnType<typeof fakeControl>
): Layer.Layer<WorkersProjector | EventChannel> => {
  const shared = Layer.mergeAll(EventChannel.layer, control.layer)

  return Layer.mergeAll(shared, WorkersProjector.layer.pipe(Layer.provide(shared)))
}

const waitForLength = (ref: Ref.Ref<ReadonlyArray<WorkersEvent>>, expected: number): Effect.Effect<void> =>
  Effect.gen(function*() {
    let attempts = 0

    while ((yield* Ref.get(ref)).length !== expected) {
      if (attempts > 500) {
        return yield* Effect.die(new Error(`received count did not reach ${expected}`))
      }

      attempts++
      yield* Effect.sleep("1 millis")
    }
  })

describe("WorkersProjector", () => {
  test("reads no statuses while the topic has no subscriber", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const reads = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector

        const loop = yield* Effect.forkChild(projector.start)

        yield* Effect.sleep("5 millis")
        yield* PubSub.publish(control.hub, lifecycle)
        yield* Effect.sleep("5 millis")

        const count = yield* Ref.get(control.counter)

        yield* Fiber.interrupt(loop)

        return count
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(reads).toBe(0)
  })

  test("publishes one snapshot per lifecycle event while subscribed", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector
        const channel = yield* EventChannel
        const received = yield* Ref.make<ReadonlyArray<WorkersEvent>>([])

        const loop = yield* Effect.forkChild(projector.start)

        const consumer = yield* Effect.forkChild(
          channel.subscribe("workers").pipe(
            Stream.filter(isWorkersEvent),
            Stream.tap((event) => Ref.update(received, (events) => [...events, event])),
            Stream.runDrain
          )
        )

        yield* waitForCount(channel, "workers", 1)
        yield* PubSub.publish(control.hub, lifecycle)
        yield* waitForLength(received, 1)

        yield* PubSub.publish(control.hub, lifecycle)
        yield* waitForLength(received, 2)

        const events = yield* Ref.get(received)

        yield* Fiber.interrupt(consumer)
        yield* Fiber.interrupt(loop)

        return events
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result).toHaveLength(2)
    expect(result.map((event) => event.workers)).toEqual([[workerStatus], [workerStatus]])
  })

  test("emits the current snapshot as the first event on subscribe", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const event = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector

        return yield* projector.subscribe.pipe(Stream.take(1), Stream.runHead)
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(Option.isSome(event)).toBe(true)
    expect(Option.getOrThrow(event).type).toBe("workers")
    expect(Option.getOrThrow(event).workers).toEqual([workerStatus])
  })

  test("a transition while unsubscribed is not delivered to a later subscriber", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector

        const loop = yield* Effect.forkChild(projector.start)

        yield* Effect.sleep("5 millis")
        yield* PubSub.publish(control.hub, lifecycle)
        yield* Effect.sleep("5 millis")
        const readsWhileUnsubscribed = yield* Ref.get(control.counter)

        const received = yield* Ref.make<ReadonlyArray<WorkersEvent>>([])

        const consumer = yield* Effect.forkChild(
          projector.subscribe.pipe(
            Stream.tap((event) => Ref.update(received, (events) => [...events, event])),
            Stream.runDrain
          )
        )

        yield* waitForLength(received, 1)
        yield* Effect.sleep("5 millis")
        const receivedAfterTransition = yield* Ref.get(received)

        yield* Fiber.interrupt(consumer)
        yield* Fiber.interrupt(loop)

        return { readsWhileUnsubscribed, receivedAfterTransition }
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result.readsWhileUnsubscribed).toBe(0)
    expect(result.receivedAfterTransition).toHaveLength(1)
    expect(result.receivedAfterTransition[0]?.workers).toEqual([workerStatus])
  })

  test("publishes nothing while subscribed with no lifecycle event", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector
        const channel = yield* EventChannel
        const received = yield* Ref.make(0)

        const loop = yield* Effect.forkChild(projector.start)

        const consumer = yield* Effect.forkChild(
          channel.subscribe("workers").pipe(
            Stream.filter(isWorkersEvent),
            Stream.tap(() => Ref.update(received, (count) => count + 1)),
            Stream.runDrain
          )
        )

        yield* waitForCount(channel, "workers", 1)
        yield* Effect.sleep("50 millis")

        const events = yield* Ref.get(received)
        const reads = yield* Ref.get(control.counter)

        yield* Fiber.interrupt(consumer)
        yield* Fiber.interrupt(loop)

        return { events, reads }
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result.events).toBe(0)
    expect(result.reads).toBe(0)
  })

  test("holds the topic subscription for the stream's lifetime", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector
        const channel = yield* EventChannel

        const consumer = yield* Effect.forkChild(projector.subscribe.pipe(Stream.runDrain))

        yield* waitForCount(channel, "workers", 1)
        const during = yield* channel.count("workers")

        yield* Fiber.interrupt(consumer)
        yield* waitForCount(channel, "workers", 0)
        const after = yield* channel.count("workers")

        return { during, after }
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result.during).toBe(1)
    expect(result.after).toBe(0)
  })

  test("drops a live event at or before the subscription's snapshot sequence", async () => {
    const control = fakeControl()
    const dependencies = projectorDependencies(control)

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const projector = yield* WorkersProjector
        const channel = yield* EventChannel
        const received = yield* Ref.make<ReadonlyArray<WorkersEvent>>([])

        const consumer = yield* Effect.forkChild(
          projector.subscribe.pipe(
            Stream.tap((event) => Ref.update(received, (events) => [...events, event])),
            Stream.runDrain
          )
        )

        // The snapshot is the first event; with no publish yet its sequence is 0.
        yield* waitForLength(received, 1)

        yield* channel.publish(
          "workers",
          WorkersEvent.make({ type: "workers", seq: 0, workers: [] })
        )
        yield* Effect.sleep("5 millis")
        const afterStale = yield* Ref.get(received)

        yield* channel.publish(
          "workers",
          WorkersEvent.make({ type: "workers", seq: 1, workers: [workerStatus] })
        )
        yield* waitForLength(received, 2)
        const afterFresh = yield* Ref.get(received)

        yield* Fiber.interrupt(consumer)

        return { afterStale, afterFresh }
      }).pipe(Effect.provide(dependencies), Effect.scoped)
    )

    expect(result.afterStale).toHaveLength(1)
    expect(result.afterFresh).toHaveLength(2)
    expect(result.afterFresh[1]?.seq).toBe(1)
  })
})
