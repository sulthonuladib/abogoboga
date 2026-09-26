import { describe, expect, test } from "bun:test"
import type { CanonicalTick, PriceLevel } from "@lister/worker-contract"
import { Effect, Layer, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import {
  convertToIdr,
  getUsdtToIdrRate,
  idrVolumeTarget,
  processTick,
  walkBookSide
} from "./QuotePipeline.ts"
import type { TickContext } from "./Supervisor.ts"
import {
  MarketMappings,
  OrderbookSnapshots,
  TickIngestion,
  TickMappingNotFound,
  type ExchangeCryptocurrencyRef,
  type OrderbookSnapshotWrite
} from "./TickIngestion.ts"

const btcSymbol = "BTC" as const

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

const snapshotsLayer = (
  writes: Ref.Ref<ReadonlyArray<OrderbookSnapshotWrite>>
): Layer.Layer<OrderbookSnapshots> =>
  Layer.succeed(
    OrderbookSnapshots,
    OrderbookSnapshots.of({
      upsert: (snapshot) => Ref.update(writes, (all) => [...all, snapshot])
    })
  )

const ingestionLayer = (
  entries: ReadonlyMap<string, ExchangeCryptocurrencyRef>,
  writes: Ref.Ref<ReadonlyArray<OrderbookSnapshotWrite>>
) => TickIngestion.layer.pipe(Layer.provide(Layer.mergeAll(mappingsLayer(entries), snapshotsLayer(writes))))

describe("quote pipeline", () => {
  test("single stub-constant rate converts USDT quotes to IDR", () => {
    const rate = getUsdtToIdrRate()

    expect(rate).toBeGreaterThan(0)
    expect(convertToIdr(1, "usdt")).toBe(rate)
    expect(convertToIdr(50_000, "idr")).toBe(50_000)
  })

  test("2M walk records full-target execution on both sides", () => {
    const out = processTick(
      tick({
        bids: [level(1_000_000, 1), level(1_000_000, 1)],
        asks: [level(1_000_000, 1), level(1_000_000, 1)]
      }),
      "idr"
    )

    expect(out).not.toBeNull()
    expect(out?.buyPrice).toBe(1_000_000)
    expect(out?.sellPrice).toBe(1_000_000)
    expect(out?.buyAmount).toBe(2)
    expect(out?.sellAmount).toBe(2)
  })

  test("walk uses the marginal price at the target level", () => {
    const out = processTick(
      tick({
        bids: [level(1_500_000, 1), level(500_000, 2)],
        asks: [level(1_500_000, 1), level(500_000, 2)]
      }),
      "idr"
    )

    expect(out?.sellPrice).toBe(500_000)
    expect(out?.buyPrice).toBe(500_000)
  })

  test("USDT-quoted book converts at the stub rate before walking", () => {
    const rate = getUsdtToIdrRate()
    const targetInUsdt = idrVolumeTarget / rate

    expect(
      processTick(tick({ bids: [level(targetInUsdt / 2, 1)], asks: [level(targetInUsdt / 2, 1)] }), "usdt")
    ).toBeNull()

    expect(
      processTick(
        tick({
          bids: [level(targetInUsdt / 2, 1), level(targetInUsdt / 2, 1)],
          asks: [level(targetInUsdt / 2, 1), level(targetInUsdt / 2, 1)]
        }),
        "usdt"
      )
    ).not.toBeNull()
  })

  test("thin book returns null so the snapshot is left untouched", () => {
    expect(walkBookSide([level(100, 1)], idrVolumeTarget)).toBeNull()
    expect(processTick(tick({ bids: [level(100, 1)], asks: [level(100, 1)] }), "idr")).toBeNull()
  })
})

describe("tick ingestion", () => {
  test("deep book upserts one snapshot for the mapped coin", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<OrderbookSnapshotWrite>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { exchangeCryptocurrencyId: 42, quoteCurrency: "idr" }]
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
        exchangeId: 1,
        exchangeCryptocurrencyId: 42,
        buyPrice: 1_000_000,
        sellPrice: 1_000_000,
        buyAmount: 2,
        sellAmount: 2,
        tickTimestamp: 1_700_000_000_000
      }
    ])
  })

  test("thin book writes nothing", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<OrderbookSnapshotWrite>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { exchangeCryptocurrencyId: 42, quoteCurrency: "idr" }]
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
    const writes = Ref.makeUnsafe<ReadonlyArray<OrderbookSnapshotWrite>>([])

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

  test("quote output is independent of the ambient clock", async () => {
    const writes = Ref.makeUnsafe<ReadonlyArray<OrderbookSnapshotWrite>>([])

    const entries = new Map<string, ExchangeCryptocurrencyRef>([
      ["1:bitcoin", { exchangeCryptocurrencyId: 42, quoteCurrency: "idr" }]
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

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(result[1])
  })
})
