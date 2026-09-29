import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer, Option, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { EventChannel, SignalProjector } from "./EventChannel.ts"
import { SignalEvent, SignalRow, SignalStore } from "./Signal.ts"

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
