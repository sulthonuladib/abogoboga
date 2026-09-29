import { describe, expect, test } from "bun:test"
import { Duration, Effect, Layer, Ref } from "effect"
import { OpportunityStore, type OpportunitySideUpdate, type OpportunitySidesWrite } from "./Opportunities.ts"
import { OpportunityWriter } from "./OpportunityWriter.ts"

const buy = (over: Partial<OpportunitySideUpdate> = {}): OpportunitySideUpdate => ({
  cryptocurrencyId: 1,
  exchangeId: 10,
  price: 1,
  volume: 1,
  tickTimestamp: 1,
  ...over
})

const recordingStore = (calls: Ref.Ref<ReadonlyArray<OpportunitySidesWrite>>): Layer.Layer<OpportunityStore> =>
  Layer.succeed(
    OpportunityStore,
    OpportunityStore.of({
      diffInit: () => Effect.void,
      applySides: (write) => Ref.update(calls, (all) => [...all, write])
    })
  )

const writerLayer = (calls: Ref.Ref<ReadonlyArray<OpportunitySidesWrite>>, intervalMillis = 10_000) =>
  OpportunityWriter.layer({ flushIntervalMillis: intervalMillis }).pipe(Layer.provide(recordingStore(calls)))

const runWithWriter = <A, E>(
  calls: Ref.Ref<ReadonlyArray<OpportunitySidesWrite>>,
  program: Effect.Effect<A, E, OpportunityWriter>,
  intervalMillis = 10_000
): Promise<A> =>
  Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(writerLayer(calls, intervalMillis)))))

describe("OpportunityWriter", () => {
  test("records many ticks but applies one batch carrying the latest value per key", async () => {
    const calls = Ref.makeUnsafe<ReadonlyArray<OpportunitySidesWrite>>([])

    const result = await runWithWriter(
      calls,
      Effect.gen(function*() {
        const writer = yield* OpportunityWriter

        // Same key three times: only the newest survives.
        yield* writer.recordBuy(buy({ price: 1, volume: 1, tickTimestamp: 1 }))
        yield* writer.recordBuy(buy({ price: 2, volume: 2, tickTimestamp: 2 }))
        yield* writer.recordBuy(buy({ price: 3, volume: 3, tickTimestamp: 3 }))
        // A second key.
        yield* writer.recordBuy(buy({ cryptocurrencyId: 2, price: 9, volume: 9, tickTimestamp: 9 }))
        // Sell side, different exchange.
        yield* writer.recordSell(buy({ exchangeId: 13, price: 7, volume: 7, tickTimestamp: 7 }))

        yield* writer.flush

        // A second flush with nothing pending is a no-op.
        yield* writer.flush

        return yield* Ref.get(calls)
      })
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.buys).toEqual([
      { cryptocurrencyId: 1, exchangeId: 10, price: 3, volume: 3, tickTimestamp: 3 },
      { cryptocurrencyId: 2, exchangeId: 10, price: 9, volume: 9, tickTimestamp: 9 }
    ])
    expect(result[0]?.sells).toEqual([
      { cryptocurrencyId: 1, exchangeId: 13, price: 7, volume: 7, tickTimestamp: 7 }
    ])
  })

  test("flushes pending updates on the interval without a manual flush", async () => {
    const calls = Ref.makeUnsafe<ReadonlyArray<OpportunitySidesWrite>>([])

    const result = await runWithWriter(
      calls,
      Effect.gen(function*() {
        const writer = yield* OpportunityWriter

        yield* writer.recordBuy(buy({ price: 42 }))

        yield* Effect.sleep(Duration.millis(80))

        return yield* Ref.get(calls)
      }),
      20
    )

    const applied = result.flatMap((write) => write.buys)

    expect(applied).toHaveLength(1)
    expect(applied[0]?.price).toBe(42)
  })

  test("flushes pending updates when the layer scope closes", async () => {
    const calls = Ref.makeUnsafe<ReadonlyArray<OpportunitySidesWrite>>([])

    await runWithWriter(
      calls,
      Effect.gen(function*() {
        const writer = yield* OpportunityWriter

        yield* writer.recordBuy(buy({ price: 55 }))
      })
    )

    const applied = Effect.runSync(Ref.get(calls)).flatMap((write) => write.buys)

    expect(applied).toHaveLength(1)
    expect(applied[0]?.price).toBe(55)
  })
})
