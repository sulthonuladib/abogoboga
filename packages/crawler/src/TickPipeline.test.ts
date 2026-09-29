import { describe, expect, test } from "bun:test"
import type { CanonicalTick, PriceLevel } from "@lister/worker-contract"
import { Effect, Layer, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import { IdrRate } from "./IdrRate.ts"
import { type OpportunitySideUpdate } from "./Opportunities.ts"
import { OpportunityWriter } from "./OpportunityWriter.ts"
import { convertToIdr, idrVolumeTarget, processTick, walkBookSide } from "./QuotePipeline.ts"
import type { TickContext } from "./Supervisor.ts"
import {
  MarketMappings,
  TickIngestion,
  TickMappingNotFound,
  type ExchangeCryptocurrencyRef
} from "./TickIngestion.ts"

const btcSymbol = "BTC" as const

const rate = 16_000

const context: TickContext = { exchangeId: 1, exchangeSlug: "indodax", shardId: "shard-1" }

const tick = (over: Partial<CanonicalTick> = {}): CanonicalTick => ({
  exchangeSlug: "indodax",
  symbol: btcSymbol,
  coingeckoId: "bitcoin",
  bids: [],
  asks: [],
  timestamp: 1_700_000_000_000,
  ...over
})

const level = (price: number, quantity: number): PriceLevel => [price, quantity]

const mappingsLayer = (entries: ReadonlyMap<string, ExchangeCryptocurrencyRef>): Layer.Layer<MarketMappings> =>
  Layer.succeed(
    MarketMappings,
    MarketMappings.of({
      lookup: (exchangeId, coingeckoId) =>
        Effect.sync(() => {
          const ref = entries.get(`${exchangeId}:${coingeckoId}`)

          return ref === undefined ? Option.none() : Option.some(ref)
        })
    })
  )

/** One recorded side update, tagged with which side it wrote. */
interface RecordedUpdate {
  readonly side: "buy" | "sell"
  readonly update: OpportunitySideUpdate
}

const writerLayer = (
  writes: Ref.Ref<ReadonlyArray<RecordedUpdate>>
): Layer.Layer<OpportunityWriter> =>
  Layer.succeed(
    OpportunityWriter,
    OpportunityWriter.of({
      recordBuy: (update) => Ref.update(writes, (all) => [...all, { side: "buy" as const, update }]),
      recordSell: (update) => Ref.update(writes, (all) => [...all, { side: "sell" as const, update }]),
      flush: Effect.void
    })
  )

const ingestionLayer = (
  entries: ReadonlyMap<string, ExchangeCryptocurrencyRef>,
  writes: Ref.Ref<ReadonlyArray<RecordedUpdate>>
) =>
  TickIngestion.layer.pipe(
    Layer.provide(Layer.mergeAll(mappingsLayer(entries), writerLayer(writes), IdrRate.constantLayer(rate)))
  )

describe("quote pipeline", () => {
  test("supplied rate converts USDT quotes to IDR", () => {
    expect(rate).toBeGreaterThan(0)
    expect(convertToIdr(1, "usdt", rate)).toBe(rate)
    expect(convertToIdr(50_000, "idr", rate)).toBe(50_000)
  })

  test("2M walk records full-target execution on both sides", () => {
    const out = processTick(
      tick({
        bids: [level(1_000_000, 1), level(1_000_000, 1)],
        asks: [level(1_000_000, 1), level(1_000_000, 1)]
      }),
      "idr",
      rate
    )

    expect(out).not.toBeNull()
    expect(out?.buyPrice).toBe(1_000_000)
    expect(out?.sellPrice).toBe(1_000_000)
    expect(out?.buyVolume).toBe(2_000_000)
    expect(out?.sellVolume).toBe(2_000_000)
  })

  test("walk uses the marginal price at the target level", () => {
    const out = processTick(
      tick({
        bids: [level(1_500_000, 1), level(500_000, 2)],
        asks: [level(1_500_000, 1), level(500_000, 2)]
      }),
      "idr",
      rate
    )

    expect(out?.sellPrice).toBe(500_000)
    expect(out?.buyPrice).toBe(500_000)
  })

  test("USDT-quoted book converts at the supplied rate before walking", () => {
    const targetInUsdt = idrVolumeTarget / rate

    expect(
      processTick(tick({ bids: [level(targetInUsdt / 2, 1)], asks: [level(targetInUsdt / 2, 1)] }), "usdt", rate)
    ).toBeNull()

    expect(
      processTick(
        tick({
          bids: [level(targetInUsdt / 2, 1), level(targetInUsdt / 2, 1)],
          asks: [level(targetInUsdt / 2, 1), level(targetInUsdt / 2, 1)]
        }),
        "usdt",
        rate
      )
    ).not.toBeNull()
  })

  test("thin book returns null so both sides are left untouched", () => {
    expect(walkBookSide([level(100, 1)], idrVolumeTarget)).toBeNull()
    expect(processTick(tick({ bids: [level(100, 1)], asks: [level(100, 1)] }), "idr", rate)).toBeNull()
  })
})

describe("tick ingestion", () => {
  test("deep book updates the buy and sell sides for the mapped coin", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<RecordedUpdate>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { cryptocurrencyId: 42, quoteCurrency: "idr" }]
    ])

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const ingestion = yield* TickIngestion

        yield* ingestion.ingest(
          tick({
            bids: [level(1_000_000, 1), level(1_000_000, 1)],
            asks: [level(1_000_000, 1), level(1_000_000, 1)]
          }),
          context
        )

        return yield* Ref.get(writes)
      }).pipe(Effect.provide(ingestionLayer(entries, writes)))
    )

    expect(result).toEqual([
      {
        side: "buy",
        update: { cryptocurrencyId: 42, exchangeId: 1, price: 1_000_000, volume: 2_000_000, tickTimestamp: 1_700_000_000_000 }
      },
      {
        side: "sell",
        update: { cryptocurrencyId: 42, exchangeId: 1, price: 1_000_000, volume: 2_000_000, tickTimestamp: 1_700_000_000_000 }
      }
    ])
  })

  test("thin book writes nothing", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<RecordedUpdate>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { cryptocurrencyId: 42, quoteCurrency: "idr" }]
    ])

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const ingestion = yield* TickIngestion

        yield* ingestion.ingest(tick({ bids: [level(100, 1)], asks: [level(100, 1)] }), context)

        return yield* Ref.get(writes)
      }).pipe(Effect.provide(ingestionLayer(entries, writes)))
    )

    expect(result).toEqual([])
  })

  test("unmapped coin fails with TickMappingNotFound", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<RecordedUpdate>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>()

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const ingestion = yield* TickIngestion

        const error = yield* Effect.flip(
          ingestion.ingest(tick({ bids: [level(1_000_000, 1)], asks: [level(1_000_000, 1)] }), context)
        )

        return { error, writes: yield* Ref.get(writes) }
      }).pipe(Effect.provide(ingestionLayer(entries, writes)))
    )

    expect(result.error).toBeInstanceOf(TickMappingNotFound)
    expect(result.error).toMatchObject({ exchangeId: 1, exchangeSlug: "indodax", coingeckoId: "bitcoin" })
    expect(result.writes).toEqual([])
  })

  test("a coin with no opportunity rows still issues both side updates", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<RecordedUpdate>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { cryptocurrencyId: 42, quoteCurrency: "idr" }]
    ])

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const ingestion = yield* TickIngestion

        yield* ingestion.ingest(
          tick({
            bids: [level(1_000_000, 1), level(1_000_000, 1)],
            asks: [level(1_000_000, 1), level(1_000_000, 1)]
          }),
          context
        )

        return yield* Ref.get(writes)
      }).pipe(Effect.provide(ingestionLayer(entries, writes)))
    )

    // The store is a no-op for rows that do not exist; ingestion cannot know.
    expect(result.map((entry) => entry.side)).toEqual(["buy", "sell"])
  })

  test("quote output is independent of the ambient clock", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<RecordedUpdate>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { cryptocurrencyId: 42, quoteCurrency: "idr" }]
    ])

    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const ingestion = yield* TickIngestion

        yield* TestClock.setTime(1_000)
        yield* ingestion.ingest(
          tick({
            bids: [level(1_000_000, 1), level(1_000_000, 1)],
            asks: [level(1_000_000, 1), level(1_000_000, 1)]
          }),
          context
        )

        yield* TestClock.setTime(9_999_999_999)
        yield* ingestion.ingest(
          tick({
            bids: [level(1_000_000, 1), level(1_000_000, 1)],
            asks: [level(1_000_000, 1), level(1_000_000, 1)]
          }),
          context
        )

        return yield* Ref.get(writes)
      }).pipe(Effect.provide(Layer.mergeAll(ingestionLayer(entries, writes), TestClock.layer())))
    )

    expect(result).toHaveLength(4)
    expect(result[0]).toEqual(result[2])
    expect(result[1]).toEqual(result[3])
  })
})
