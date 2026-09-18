import {
  Database,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"

/**
 * Exchanges the CMC export can mark a coin as tradeable on.
 *
 * `key` matches both the per-exchange boolean flag and the alternate-symbol
 * prefix in the export file; `slug` is the seeded exchange identity used by
 * the upsert.
 */
export const supportedExchanges = [
  {
    key: "indodax",
    name: "Indodax",
    slug: "indodax",
    cmcId: 900001,
    baseCurrency: "idr"
  },
  {
    key: "gateio",
    name: "Gate.io",
    slug: "gateio",
    cmcId: 302,
    baseCurrency: "usdt"
  },
  {
    key: "kucoin",
    name: "KuCoin",
    slug: "kucoin",
    cmcId: 311,
    baseCurrency: "usdt"
  },
  {
    key: "mexc",
    name: "MEXC",
    slug: "mexc",
    cmcId: 544,
    baseCurrency: "usdt"
  },
  {
    key: "bitget",
    name: "Bitget",
    slug: "bitget",
    cmcId: 513,
    baseCurrency: "usdt"
  },
  {
    key: "binance",
    name: "Binance",
    slug: "binance",
    cmcId: 270,
    baseCurrency: "usdt"
  },
  {
    key: "htx",
    name: "HTX (Huobi)",
    slug: "htx",
    cmcId: 102,
    baseCurrency: "usdt"
  },
  {
    key: "bybit",
    name: "Bybit",
    slug: "bybit",
    cmcId: 521,
    baseCurrency: "usdt"
  }
] as const

/**
 * Per-exchange key of a {@link supportedExchanges} entry.
 */
export type ExchangeKey = (typeof supportedExchanges)[number]["key"]

const optionalBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))

const optionalSymbol = Schema.optional(Schema.NullOr(Schema.String))

/**
 * One cryptocurrency row in the CMC export file.
 *
 * Every exchange flag and alternate symbol is optional and nullable, so a
 * missing field is treated as "not enabled" rather than as a decode failure.
 */
export const coinSchema = Schema.Struct({
  cmcId: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  name: Schema.NonEmptyString,
  symbol: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
  logo: Schema.optional(Schema.NullOr(Schema.String)),
  indodax: optionalBoolean,
  gateio: optionalBoolean,
  kucoin: optionalBoolean,
  mexc: optionalBoolean,
  bitget: optionalBoolean,
  binance: optionalBoolean,
  htx: optionalBoolean,
  huobi: optionalBoolean,
  bybit: optionalBoolean,
  indodaxAlternateSymbol: optionalSymbol,
  gateioAlternateSymbol: optionalSymbol,
  kucoinAlternateSymbol: optionalSymbol,
  mexcAlternateSymbol: optionalSymbol,
  bitgetAlternateSymbol: optionalSymbol,
  binanceAlternateSymbol: optionalSymbol,
  htxAlternateSymbol: optionalSymbol,
  huobiAlternateSymbol: optionalSymbol,
  bybitAlternateSymbol: optionalSymbol
})

/**
 * Decoded CMC export entry before optional values are normalized.
 */
export type CoinFileEntry = typeof coinSchema.Type

/**
 * CMC export entry with the optional logo normalized to a non-null string.
 */
export type CoinDataEntry = Omit<CoinFileEntry, "logo"> & { readonly logo: string }

/**
 * A bare array of coin rows, as written by the CMC scraper.
 */
export const coinDataSchema = Schema.Array(coinSchema)

/**
 * Accepted CMC export shapes: a bare array or an API-style `{ data }` wrapper.
 */
export const coinDataFileSchema = Schema.Union([coinDataSchema, Schema.Struct({ data: coinDataSchema })])

/**
 * Decoded CMC export file, in either accepted shape.
 */
export type CoinFile = typeof coinDataFileSchema.Type

const decodeCoinFile = Schema.decodeEffect(coinDataFileSchema)

const decodeCoinFileJson = Schema.decodeEffect(Schema.fromJsonString(coinDataFileSchema))

const normalizeCoin = (coin: CoinFileEntry): CoinDataEntry => ({ ...coin, logo: coin.logo ?? "" })

const normalizeCoinFile = (file: CoinFile): ReadonlyArray<CoinDataEntry> =>
  ("data" in file ? file.data : file).map(normalizeCoin)

/**
 * Decode an already-parsed CMC export payload (array or `{ data }` wrapper).
 */
export const parseCoinData = Effect.fn("parseCoinData")(function*(file: CoinFile) {
  return normalizeCoinFile(yield* decodeCoinFile(file))
})

/**
 * Decode the raw JSON text of a CMC export file.
 */
export const parseCoinDataJson = Effect.fn("parseCoinDataJson")(function*(json: string) {
  return normalizeCoinFile(yield* decodeCoinFileJson(json))
})

/**
 * Rows an import writes, before database ids are known.
 */
export type CoinImportPlan = {
  coins: Array<typeof cryptocurrencyTable.$inferInsert>
  exchanges: Array<typeof exchangeTable.$inferInsert>
  assignments: Array<{
    exchangeKey: ExchangeKey
    cmcId: number
    exchangeSymbol: string
  }>
}

/**
 * Map decoded export entries onto the rows and assignments an import writes.
 *
 * Coins are deduplicated by `cmcId` with the last occurrence winning, matching
 * the legacy importer. Assignments are emitted only for exchanges explicitly
 * enabled on a coin, and `huobi` is accepted as an alias for `htx`.
 */
export const mapCoinData = (coins: ReadonlyArray<CoinDataEntry>): CoinImportPlan => {
  const uniqueCoins = new Map<number, CoinDataEntry>()

  for (const coin of coins) {
    uniqueCoins.set(coin.cmcId, coin)
  }

  const exchanges = supportedExchanges.map((exchange) => ({
    cmcId: exchange.cmcId,
    name: exchange.name,
    slug: exchange.slug,
    logo: "",
    baseCurrency: exchange.baseCurrency
  }))

  const assignments: CoinImportPlan["assignments"] = []

  for (const coin of uniqueCoins.values()) {
    for (const exchange of supportedExchanges) {
      const enabled = coin[exchange.key] === true || (exchange.key === "htx" && coin.huobi === true)

      if (!enabled) continue

      const alternate =
        coin[`${exchange.key}AlternateSymbol`] ??
        (exchange.key === "htx" ? coin.huobiAlternateSymbol : undefined)

      assignments.push({
        exchangeKey: exchange.key,
        cmcId: coin.cmcId,
        exchangeSymbol: alternate ?? coin.symbol
      })
    }
  }

  return {
    coins: [...uniqueCoins.values()].map(({ cmcId, name, symbol, slug, logo }) => ({
      cmcId,
      name,
      symbol,
      slug,
      logo
    })),
    exchanges,
    assignments
  }
}

/**
 * Counts of rows written by {@link importCoinData}.
 */
export interface CoinDataImportSummary {
  readonly cryptocurrencies: number
  readonly exchanges: number
  readonly assignments: number
}

/**
 * Upsert a decoded coin export in a single transaction.
 *
 * Coins conflict on `cmcId`, exchanges on `slug`, and assignments on
 * `(exchangeId, cryptocurrencyId)`, so re-running the import refreshes names,
 * symbols, and alternate symbols without duplicating rows.
 */
export const importCoinData = Effect.fn("importCoinData")(function*(coins: ReadonlyArray<CoinDataEntry>) {
  const plan = mapCoinData(coins)
  const { db } = yield* Database

  yield* db.transaction((tx) =>
    Effect.gen(function*() {
      const importedCoins =
        plan.coins.length === 0
          ? []
          : yield* tx
              .insert(cryptocurrencyTable)
              .values(plan.coins)
              .onConflictDoUpdate({
                target: cryptocurrencyTable.cmcId,
                set: {
                  name: sql`excluded.name`,
                  symbol: sql`excluded.symbol`,
                  slug: sql`excluded.slug`,
                  logo: sql`excluded.logo`
                }
              })
              .returning({
                id: cryptocurrencyTable.id,
                cmcId: cryptocurrencyTable.cmcId
              })

      const importedExchanges = yield* tx
        .insert(exchangeTable)
        .values(plan.exchanges)
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

      const coinsByCmcId = new Map<number, number>()

      for (const coin of importedCoins) {
        coinsByCmcId.set(coin.cmcId, coin.id)
      }

      const exchangesBySlug = new Map<string, number>()

      for (const exchange of importedExchanges) {
        exchangesBySlug.set(exchange.slug, exchange.id)
      }

      const assignmentRows = plan.assignments.flatMap((assignment) => {
        const cryptocurrencyId = coinsByCmcId.get(assignment.cmcId)
        const exchangeId = exchangesBySlug.get(assignment.exchangeKey)

        return cryptocurrencyId === undefined || exchangeId === undefined
          ? []
          : [
              {
                exchangeId,
                cryptocurrencyId,
                exchangeSymbol: assignment.exchangeSymbol
              }
            ]
      })

      if (assignmentRows.length > 0) {
        yield* tx
          .insert(exchangeCryptocurrencyTable)
          .values(assignmentRows)
          .onConflictDoUpdate({
            target: [
              exchangeCryptocurrencyTable.exchangeId,
              exchangeCryptocurrencyTable.cryptocurrencyId
            ],
            set: { exchangeSymbol: sql`excluded."exchangeSymbol"` }
          })
      }
    })
  )

  return {
    cryptocurrencies: plan.coins.length,
    exchanges: plan.exchanges.length,
    assignments: plan.assignments.length
  }
})
