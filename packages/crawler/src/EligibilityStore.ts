import { Database, cryptocurrencyTable, exchangeCryptocurrencyChainTable, exchangeCryptocurrencyTable, exchangeTable } from "@lister/db"
import { eq, inArray } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { Eligibility } from "./Reconciler.ts"
import { scanRoutes } from "./RouteScan.ts"

/**
 * Drizzle-backed implementation of the {@link Eligibility} port.
 *
 * The route scan is recomputed from the database on every call, never cached:
 * only chain-link rows are read, and the pure {@link scanRoutes} helper decides
 * which coins are route-eligible and which ordered pairs the matrix should
 * hold. Listed and trade-enabled flags are applied by the scan, not the query,
 * so the predicate matrix stays in one tested place.
 */
export const layer: Layer.Layer<Eligibility, never, Database> = Layer.effect(
  Eligibility,
  Effect.gen(function*() {
    const { db } = yield* Database

    const exchangeSlug = Effect.fn("Eligibility.exchangeSlug")(function*(exchangeId: number) {
      const rows = yield* db
        .select({ slug: exchangeTable.slug })
        .from(exchangeTable)
        .where(eq(exchangeTable.id, exchangeId))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.map(Option.fromIterable(rows), (row) => row.slug)
    })

    const scan = Effect.fn("Eligibility.scan")(function*(activeExchangeIds: ReadonlyArray<number>) {
      if (activeExchangeIds.length === 0) {
        return { subscriptions: [], pairs: [] }
      }

      const rows = yield* db
        .select({
          exchangeId: exchangeCryptocurrencyTable.exchangeId,
          cryptocurrencyId: exchangeCryptocurrencyTable.cryptocurrencyId,
          symbol: cryptocurrencyTable.symbol,
          coingeckoId: cryptocurrencyTable.coingeckoId,
          listed: exchangeCryptocurrencyTable.listed,
          tradeEnabled: exchangeCryptocurrencyTable.tradeEnabled,
          chainId: exchangeCryptocurrencyChainTable.chainId,
          withdrawEnabled: exchangeCryptocurrencyChainTable.withdrawEnabled,
          depositEnabled: exchangeCryptocurrencyChainTable.depositEnabled
        })
        .from(exchangeCryptocurrencyTable)
        .innerJoin(
          cryptocurrencyTable,
          eq(cryptocurrencyTable.id, exchangeCryptocurrencyTable.cryptocurrencyId)
        )
        .innerJoin(
          exchangeCryptocurrencyChainTable,
          eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, exchangeCryptocurrencyTable.id)
        )
        .where(inArray(exchangeCryptocurrencyTable.exchangeId, [...activeExchangeIds]))
        .pipe(Effect.orDie)

      return scanRoutes(rows, activeExchangeIds)
    })

    const coinsForExchange = Effect.fn("Eligibility.coinsForExchange")(function*(
      exchangeId: number,
      activeExchangeIds: ReadonlyArray<number>
    ) {
      const result = yield* scan(activeExchangeIds)

      return result.subscriptions.find((subscription) => subscription.exchangeId === exchangeId)?.coins ?? []
    })

    const pairsFor = Effect.fn("Eligibility.pairsFor")(function*(activeExchangeIds: ReadonlyArray<number>) {
      const result = yield* scan(activeExchangeIds)

      return result.pairs
    })

    return Eligibility.of({ exchangeSlug, coinsForExchange, pairsFor })
  })
)
