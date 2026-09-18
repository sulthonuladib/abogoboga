import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { and, eq, sql } from "drizzle-orm"
import { Effect } from "effect"

type TesterExchange = {
  readonly slug: string
  readonly name: string
  readonly cmcId: number
  readonly logo: string
  readonly baseCurrency: "usdt" | "idr"
  readonly symbols: Readonly<Record<"BTC" | "ETH", string>>
}

type TesterCoin = {
  readonly cmcId: number
  readonly name: string
  readonly symbol: string
  readonly slug: string
  readonly logo: string
}

const testerExchanges: ReadonlyArray<TesterExchange> = [
  {
    slug: "exchange-tester-a",
    name: "Exchange Tester A",
    cmcId: 910001,
    logo: "",
    baseCurrency: "usdt",
    symbols: { BTC: "BTCUSDT", ETH: "ETHUSDT" }
  },
  {
    slug: "exchange-tester-b",
    name: "Exchange Tester B",
    cmcId: 910002,
    logo: "",
    baseCurrency: "idr",
    symbols: { BTC: "BTCIDR", ETH: "ETHIDR" }
  }
]

const testerCoins: Array<TesterCoin> = [
  { cmcId: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin", logo: "" },
  { cmcId: 1027, name: "Ethereum", symbol: "ETH", slug: "ethereum", logo: "" }
]

const testerChains: Array<{ readonly code: string; readonly name: string }> = [
  { code: "BTC", name: "Bitcoin" },
  { code: "ETH", name: "Ethereum" }
]

const testerChainBySymbol = { BTC: "BTC", ETH: "ETH" } as const

const testerChainCode = (symbol: string): string | undefined => {
  if (symbol !== "BTC" && symbol !== "ETH") return undefined

  return testerChainBySymbol[symbol]
}

/**
 * Per-exchange eligible coin counts observed after seeding.
 */
export interface TesterSeedSummary {
  readonly exchanges: number
  readonly coins: number
  readonly mappings: number
  readonly eligibility: Record<string, number>
}

/**
 * Seed idempotent tester exchanges for crawler development.
 *
 * Writes two tester exchanges (USDT- and IDR-quoted), reuses or creates the
 * BTC/ETH coins, links each listing to its mainnet chain with withdraw and
 * deposit enabled, and re-enables listed/trade-enabled on every run. The
 * returned eligibility counts are read back through the same
 * listed + tradeEnabled + enabled-chain gate the crawler uses.
 */
export const seedTesterExchanges = Effect.fn("seedTesterExchanges")(function*() {
  const { db } = yield* Database
  const exchangeIds = new Map<string, number>()

  yield* db.transaction((tx) =>
    Effect.gen(function*() {
      const importedCoins = yield* tx
        .insert(cryptocurrencyTable)
        .values(testerCoins)
        .onConflictDoUpdate({
          target: cryptocurrencyTable.cmcId,
          set: {
            name: sql`excluded.name`,
            symbol: sql`excluded.symbol`,
            slug: sql`excluded.slug`,
            logo: sql`excluded.logo`
          }
        })
        .returning({ id: cryptocurrencyTable.id, symbol: cryptocurrencyTable.symbol })

      const importedExchanges = yield* tx
        .insert(exchangeTable)
        .values(
          testerExchanges.map((exchange) => ({
            slug: exchange.slug,
            name: exchange.name,
            cmcId: exchange.cmcId,
            logo: exchange.logo,
            baseCurrency: exchange.baseCurrency
          }))
        )
        .onConflictDoUpdate({
          target: exchangeTable.slug,
          set: {
            cmcId: sql`excluded."cmcId"`,
            name: sql`excluded.name`,
            logo: sql`excluded.logo`,
            baseCurrency: sql`excluded."baseCurrency"`
          }
        })
        .returning({ id: exchangeTable.id, slug: exchangeTable.slug })

      const importedChains = yield* tx
        .insert(chainTable)
        .values(testerChains)
        .onConflictDoUpdate({
          target: chainTable.code,
          set: { name: sql`excluded.name` }
        })
        .returning({ id: chainTable.id, code: chainTable.code })

      const coinsBySymbol = new Map<string, number>()

      for (const coin of importedCoins) {
        coinsBySymbol.set(coin.symbol, coin.id)
      }

      const exchangesBySlug = new Map<string, number>()

      for (const exchange of importedExchanges) {
        exchangesBySlug.set(exchange.slug, exchange.id)
      }

      const chainsByCode = new Map<string, number>()

      for (const chain of importedChains) {
        chainsByCode.set(chain.code, chain.id)
      }

      const symbols: ReadonlyArray<"BTC" | "ETH"> = ["BTC", "ETH"]

      const mappingRows = testerExchanges.flatMap((exchange) => {
        const exchangeId = exchangesBySlug.get(exchange.slug)

        if (exchangeId === undefined) return []

        return symbols.flatMap((symbol) => {
          const cryptocurrencyId = coinsBySymbol.get(symbol)

          return cryptocurrencyId === undefined
            ? []
            : [
                {
                  exchangeId,
                  cryptocurrencyId,
                  exchangeSymbol: exchange.symbols[symbol],
                  listed: true,
                  tradeEnabled: true
                }
              ]
        })
      })

      const importedMappings = yield* tx
        .insert(exchangeCryptocurrencyTable)
        .values(mappingRows)
        .onConflictDoUpdate({
          target: [
            exchangeCryptocurrencyTable.exchangeId,
            exchangeCryptocurrencyTable.cryptocurrencyId
          ],
          set: {
            exchangeSymbol: sql`excluded."exchangeSymbol"`,
            listed: true,
            tradeEnabled: true
          }
        })
        .returning({
          id: exchangeCryptocurrencyTable.id,
          cryptocurrencyId: exchangeCryptocurrencyTable.cryptocurrencyId
        })

      const symbolByCryptoId = new Map<number, string>()

      for (const coin of importedCoins) {
        symbolByCryptoId.set(coin.id, coin.symbol)
      }

      const linkRows = importedMappings.flatMap((mapping) => {
        const symbol = symbolByCryptoId.get(mapping.cryptocurrencyId)
        const chainCode = symbol === undefined ? undefined : testerChainCode(symbol)
        const chainId = chainCode === undefined ? undefined : chainsByCode.get(chainCode)

        return chainId === undefined || chainCode === undefined
          ? []
          : [
              {
                exchangeCryptocurrencyId: mapping.id,
                chainId,
                exchangeChainCode: chainCode,
                withdrawEnabled: true,
                depositEnabled: true
              }
            ]
      })

      if (linkRows.length > 0) {
        yield* tx
          .insert(exchangeCryptocurrencyChainTable)
          .values(linkRows)
          .onConflictDoUpdate({
            target: [
              exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
              exchangeCryptocurrencyChainTable.chainId
            ],
            set: {
              exchangeChainCode: sql`excluded."exchangeChainCode"`,
              withdrawEnabled: true,
              depositEnabled: true
            }
          })
      }

      for (const [slug, id] of exchangesBySlug) {
        exchangeIds.set(slug, id)
      }
    })
  )

  const eligibility: Record<string, number> = {}

  for (const [slug, exchangeId] of exchangeIds) {
    const rows = yield* db
      .selectDistinct({ id: exchangeCryptocurrencyTable.id })
      .from(exchangeCryptocurrencyTable)
      .innerJoin(
        exchangeCryptocurrencyChainTable,
        and(
          eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, exchangeCryptocurrencyTable.id),
          eq(exchangeCryptocurrencyChainTable.withdrawEnabled, true),
          eq(exchangeCryptocurrencyChainTable.depositEnabled, true)
        )
      )
      .where(
        and(
          eq(exchangeCryptocurrencyTable.exchangeId, exchangeId),
          eq(exchangeCryptocurrencyTable.listed, true),
          eq(exchangeCryptocurrencyTable.tradeEnabled, true)
        )
      )

    eligibility[slug] = rows.length
  }

  return {
    exchanges: testerExchanges.length,
    coins: testerCoins.length,
    mappings: testerExchanges.length * testerCoins.length,
    eligibility
  }
})
