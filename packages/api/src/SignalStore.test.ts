import { describe, expect, test } from "bun:test"
import {
  Database,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable,
  opportunityTable
} from "@lister/db"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { SignalStore } from "./Signal.ts"
import { layer as signalStoreLayer } from "./SignalStore.ts"

const databaseLayer = Database.layerMemory()

const storeProvided = signalStoreLayer.pipe(Layer.provide(databaseLayer))

const withStore = <A, E>(
  program: Effect.Effect<A, E, Database | SignalStore>
): Promise<A> =>
  Effect.runPromise(
    program.pipe(Effect.provide(Layer.mergeAll(storeProvided, databaseLayer, TestClock.layer())))
  )

const seedExchange = (slug: string) =>
  Effect.gen(function*() {
    const { db } = yield* Database

    const [exchange] = yield* db
      .insert(exchangeTable)
      .values({
        coingeckoId: slug,
        name: slug,
        slug,
        logo: `${slug}.svg`,
        baseCurrency: "idr"
      })
      .returning()

    return exchange!.id
  })

const seedCoin = (symbol: string, coingeckoId: string) =>
  Effect.gen(function*() {
    const { db } = yield* Database

    const [coin] = yield* db
      .insert(cryptocurrencyTable)
      .values({
        coingeckoId,
        name: symbol,
        symbol,
        slug: coingeckoId,
        logo: `${coingeckoId}.svg`
      })
      .returning()

    return coin!.id
  })

const seedMarket = (exchangeId: number, cryptocurrencyId: number, exchangeSymbol: string) =>
  Effect.flatMap(Database, ({ db }) =>
    db.insert(exchangeCryptocurrencyTable).values({
      exchangeId,
      cryptocurrencyId,
      exchangeSymbol
    }))

describe("SignalStore", () => {
  test("keeps a fresh profitable row and drops a stale one", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const buyExchangeId = yield* seedExchange("buy-ex")
        const sellExchangeId = yield* seedExchange("sell-ex")
        const freshCoinId = yield* seedCoin("BTC", "bitcoin")
        const staleCoinId = yield* seedCoin("ETH", "ethereum")

        yield* seedMarket(buyExchangeId, freshCoinId, "BTC/IDR")
        yield* seedMarket(sellExchangeId, freshCoinId, "BTC/USDT")
        yield* seedMarket(buyExchangeId, staleCoinId, "ETH/IDR")
        yield* seedMarket(sellExchangeId, staleCoinId, "ETH/USDT")

        yield* TestClock.setTime(1_000_000)

        yield* db.insert(opportunityTable).values([
          {
            cryptocurrencyId: freshCoinId,
            buyExchangeId,
            sellExchangeId,
            buyPrice: 1_000_000,
            sellPrice: 1_100_000,
            buyVolume: 2,
            sellVolume: 3,
            buyTickTimestamp: 999_900,
            sellTickTimestamp: 999_800
          },
          {
            cryptocurrencyId: staleCoinId,
            buyExchangeId,
            sellExchangeId,
            buyPrice: 1_000_000,
            sellPrice: 1_100_000,
            buyVolume: 2,
            sellVolume: 3,
            buyTickTimestamp: 994_000,
            sellTickTimestamp: 999_800
          }
        ])

        const store = yield* SignalStore

        return yield* store.project
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.symbol).toBe("BTC")
  })

  test("derives profit percent and profit volume from the smaller base", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const buyExchangeId = yield* seedExchange("buy-ex")
        const sellExchangeId = yield* seedExchange("sell-ex")
        const coinId = yield* seedCoin("BTC", "bitcoin")

        yield* seedMarket(buyExchangeId, coinId, "BTC/IDR")
        yield* seedMarket(sellExchangeId, coinId, "BTC/USDT")

        yield* TestClock.setTime(1_000_000)

        yield* db.insert(opportunityTable).values({
          cryptocurrencyId: coinId,
          buyExchangeId,
          sellExchangeId,
          buyPrice: 1_000_000,
          sellPrice: 1_100_000,
          buyVolume: 10,
          sellVolume: 1,
          buyTickTimestamp: 999_900,
          sellTickTimestamp: 999_900
        })

        const store = yield* SignalStore

        return yield* store.project
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.profitPercent).toBeCloseTo(10, 10)
    expect(rows[0]?.profitVolume).toBeCloseTo((1 / 1_100_000) * 100_000, 12)
  })

  test("sends a sub-threshold row and a non-profitable row is absent", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const buyExchangeId = yield* seedExchange("buy-ex")
        const sellExchangeId = yield* seedExchange("sell-ex")
        const thinCoinId = yield* seedCoin("BTC", "bitcoin")
        const lossCoinId = yield* seedCoin("ETH", "ethereum")

        yield* seedMarket(buyExchangeId, thinCoinId, "BTC/IDR")
        yield* seedMarket(sellExchangeId, thinCoinId, "BTC/USDT")
        yield* seedMarket(buyExchangeId, lossCoinId, "ETH/IDR")
        yield* seedMarket(sellExchangeId, lossCoinId, "ETH/USDT")

        yield* TestClock.setTime(1_000_000)

        yield* db.insert(opportunityTable).values([
          {
            cryptocurrencyId: thinCoinId,
            buyExchangeId,
            sellExchangeId,
            buyPrice: 1_000_000,
            sellPrice: 1_000_100,
            buyVolume: 2,
            sellVolume: 3,
            buyTickTimestamp: 999_900,
            sellTickTimestamp: 999_900
          },
          {
            cryptocurrencyId: lossCoinId,
            buyExchangeId,
            sellExchangeId,
            buyPrice: 1_000_000,
            sellPrice: 900_000,
            buyVolume: 2,
            sellVolume: 3,
            buyTickTimestamp: 999_900,
            sellTickTimestamp: 999_900
          }
        ])

        const store = yield* SignalStore

        return yield* store.project
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.symbol).toBe("BTC")
    expect(rows[0]?.profitPercent).toBeCloseTo(0.01, 10)
  })
})
