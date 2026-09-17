import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "./Database.ts"
import {
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable,
} from "./schema.ts"

describe("Database.layerMemory", () => {
  test("migrates an in-memory database and serves relational queries", async () => {
    const program = Effect.gen(function*() {
      const { db } = yield* Database

      const [exchange] = yield* db
        .insert(exchangeTable)
        .values({
          cmcId: 270,
          name: "Binance",
          slug: "binance",
          logo: "binance.svg",
          baseCurrency: "usdt",
        })
        .returning()

      const [coin] = yield* db
        .insert(cryptocurrencyTable)
        .values({
          cmcId: 1,
          name: "Bitcoin",
          symbol: "BTC",
          slug: "bitcoin",
          logo: "bitcoin.svg",
        })
        .returning()

      const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

      const [mapping] = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values({
          exchangeId: exchange!.id,
          cryptocurrencyId: coin!.id,
          exchangeSymbol: "BTCUSDT",
        })
        .returning()

      yield* db.insert(exchangeCryptocurrencyChainTable).values({
        exchangeCryptocurrencyId: mapping!.id,
        chainId: chain!.id,
        exchangeChainCode: "ERC20",
      })

      return yield* db.query.exchangeCryptocurrencyTable.findMany({
        with: {
          exchange: true,
          cryptocurrency: true,
          exchangeCryptocurrencyChains: true,
        },
      })
    })

    const rows = await Effect.runPromise(
      program.pipe(Effect.provide(Database.layerMemory()), Effect.scoped)
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.exchange?.slug).toBe("binance")
    expect(rows[0]!.cryptocurrency?.symbol).toBe("BTC")
    expect(rows[0]!.exchangeCryptocurrencyChains).toHaveLength(1)
  })
})
