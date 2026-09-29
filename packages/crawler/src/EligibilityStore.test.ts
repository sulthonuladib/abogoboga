import { describe, expect, test } from "bun:test"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { Effect, Layer } from "effect"
import { layer as eligibilityStoreLayer } from "./EligibilityStore.ts"
import { Eligibility } from "./Reconciler.ts"

describe("EligibilityStore subscriptions", () => {
  test("subscriptions carry the exchange symbol, not the canonical coin symbol", async () => {
    const database = Database.layerMemory()

    const seed = Effect.gen(function*() {
      const { db } = yield* Database

      const [indodax] = yield* db
        .insert(exchangeTable)
        .values({
          coingeckoId: "indodax",
          name: "Indodax",
          slug: "indodax",
          logo: "indodax.svg",
          baseCurrency: "idr"
        })
        .returning()

      const [gateio] = yield* db
        .insert(exchangeTable)
        .values({
          coingeckoId: "gate",
          name: "Gate.io",
          slug: "gateio",
          logo: "gateio.svg",
          baseCurrency: "usdt"
        })
        .returning()

      const [fun] = yield* db
        .insert(cryptocurrencyTable)
        .values({ coingeckoId: "funfair", name: "FUNToken", symbol: "FUN", slug: "funfair", logo: "fun.svg" })
        .returning()

      const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

      const [indodaxFun] = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values({ exchangeId: indodax!.id, cryptocurrencyId: fun!.id, exchangeSymbol: "FUN" })
        .returning()

      const [gateioFun] = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values({ exchangeId: gateio!.id, cryptocurrencyId: fun!.id, exchangeSymbol: "FUNTOKEN" })
        .returning()

      for (const mapping of [indodaxFun, gateioFun]) {
        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: mapping!.id,
          chainId: chain!.id,
          exchangeChainCode: "ERC20",
          withdrawEnabled: true,
          depositEnabled: true
        })
      }

      return { indodax: indodax!.id, gateio: gateio!.id }
    })

    const program = Effect.gen(function*() {
      const eligibility = yield* Eligibility
      const ids = yield* seed
      const active = [ids.indodax, ids.gateio]

      const indodaxCoins = yield* eligibility.coinsForExchange(ids.indodax, active)
      const gateioCoins = yield* eligibility.coinsForExchange(ids.gateio, active)

      return { indodaxCoins, gateioCoins }
    })

    const full = eligibilityStoreLayer.pipe(Layer.provideMerge(database))
    const result = await Effect.runPromise(program.pipe(Effect.provide(full)))

    expect(result.indodaxCoins).toEqual([{ symbol: "FUN", coingeckoId: "funfair" }])
    expect(result.gateioCoins).toEqual([{ symbol: "FUNTOKEN", coingeckoId: "funfair" }])
  })
})
