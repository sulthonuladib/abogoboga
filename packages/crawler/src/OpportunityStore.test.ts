import { describe, expect, test } from "bun:test"
import { Database, cryptocurrencyTable, exchangeTable, opportunityTable } from "@lister/db"
import { Effect, Layer, Scope } from "effect"
import { eq } from "drizzle-orm"
import { OpportunityStore } from "./Opportunities.ts"
import { opportunityStoreLayer } from "./OpportunityStore.ts"

const seedLayer = Database.layerMemory()

const storeProvided = opportunityStoreLayer.pipe(Layer.provide(seedLayer))

const withStore = <A, E>(program: Effect.Effect<A, E, Database | OpportunityStore | Scope.Scope>): Promise<A> =>
  Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(storeProvided, seedLayer)), Effect.scoped))

const seedMarket = Effect.gen(function*() {
  const { db } = yield* Database

  const [buy] = yield* db
    .insert(exchangeTable)
    .values({
      coingeckoId: "buy-ex",
      name: "Buy",
      slug: "buy-ex",
      logo: "buy.svg",
      baseCurrency: "idr"
    })
    .returning()

  const [sell] = yield* db
    .insert(exchangeTable)
    .values({
      coingeckoId: "sell-ex",
      name: "Sell",
      slug: "sell-ex",
      logo: "sell.svg",
      baseCurrency: "usdt"
    })
    .returning()

  const [coin] = yield* db
    .insert(cryptocurrencyTable)
    .values({
      coingeckoId: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      slug: "bitcoin",
      logo: "bitcoin.svg"
    })
    .returning()

  return { buyExchangeId: buy!.id, sellExchangeId: sell!.id, cryptocurrencyId: coin!.id }
})

describe("OpportunityStore", () => {
  test("diffInit inserts a missing route at zero price and volume", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const store = yield* OpportunityStore
        const key = yield* seedMarket

        yield* store.diffInit([key])

        return yield* db.select().from(opportunityTable)
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      buyPrice: 0,
      sellPrice: 0,
      buyVolume: 0,
      sellVolume: 0,
      buyTickTimestamp: 0,
      sellTickTimestamp: 0
    })
  })

  test("diffInit deletes a vanished route and keeps the surviving one", async () => {
    const remaining = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const store = yield* OpportunityStore
        const key = yield* seedMarket

        const reverse = {
          cryptocurrencyId: key.cryptocurrencyId,
          buyExchangeId: key.sellExchangeId,
          sellExchangeId: key.buyExchangeId
        }

        yield* store.diffInit([key, reverse])
        yield* store.diffInit([reverse])

        return yield* db.select().from(opportunityTable)
      })
    )

    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toMatchObject({
      buyExchangeId: 2,
      sellExchangeId: 1
    })
  })

  test("a buy update leaves the sell side untouched, and vice versa", async () => {
    const result = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const store = yield* OpportunityStore
        const key = yield* seedMarket

        yield* store.diffInit([key])
        yield* store.applySides({
          buys: [{
            cryptocurrencyId: key.cryptocurrencyId,
            exchangeId: key.buyExchangeId,
            price: 1_000_000,
            volume: 2,
            tickTimestamp: 111
          }],
          sells: []
        })

        const [afterBuy] = yield* db.select().from(opportunityTable)

        yield* store.applySides({
          buys: [],
          sells: [{
            cryptocurrencyId: key.cryptocurrencyId,
            exchangeId: key.sellExchangeId,
            price: 1_100_000,
            volume: 3,
            tickTimestamp: 222
          }]
        })

        const [afterSell] = yield* db.select().from(opportunityTable)

        return { afterBuy, afterSell }
      })
    )

    expect(result.afterBuy).toMatchObject({
      buyPrice: 1_000_000,
      buyVolume: 2,
      buyTickTimestamp: 111,
      sellPrice: 0,
      sellVolume: 0,
      sellTickTimestamp: 0
    })

    expect(result.afterSell).toMatchObject({
      buyPrice: 1_000_000,
      buyVolume: 2,
      buyTickTimestamp: 111,
      sellPrice: 1_100_000,
      sellVolume: 3,
      sellTickTimestamp: 222
    })
  })

  test("a side update for a coin with no rows changes nothing", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const store = yield* OpportunityStore
        const key = yield* seedMarket

        yield* store.diffInit([key])
        yield* store.applySides({
          buys: [{
            cryptocurrencyId: 999,
            exchangeId: key.buyExchangeId,
            price: 1,
            volume: 1,
            tickTimestamp: 1
          }],
          sells: []
        })

        return yield* db.select().from(opportunityTable)
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.buyPrice).toBe(0)
  })

  test("diffInit preserves prices already written on a surviving row", async () => {
    const rows = await withStore(
      Effect.gen(function*() {
        const { db } = yield* Database
        const store = yield* OpportunityStore
        const key = yield* seedMarket

        yield* store.diffInit([key])
        yield* store.applySides({
          buys: [{
            cryptocurrencyId: key.cryptocurrencyId,
            exchangeId: key.buyExchangeId,
            price: 1_000_000,
            volume: 2,
            tickTimestamp: 111
          }],
          sells: []
        })
        yield* store.diffInit([key])

        return yield* db
          .select()
          .from(opportunityTable)
          .where(eq(opportunityTable.cryptocurrencyId, key.cryptocurrencyId))
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.buyPrice).toBe(1_000_000)
  })
})
