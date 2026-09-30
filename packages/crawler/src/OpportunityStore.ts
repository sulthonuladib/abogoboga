import {
  Database,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable,
  opportunityTable
} from "@lister/db"
import { and, eq, inArray } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { MarketMappings } from "./TickIngestion.ts"
import { OpportunityStore, type OpportunityKey, type OpportunitySidesWrite } from "./Opportunities.ts"

const keyOf = (key: OpportunityKey): string =>
  `${key.cryptocurrencyId}:${key.buyExchangeId}:${key.sellExchangeId}`

/**
 * Drizzle adapter for {@link MarketMappings}.
 *
 * Resolves a tick's CoinGecko id against the exchange's coin mapping and reads
 * the exchange's quote currency in the same query. The resolved
 * `cryptocurrencyId` is what the opportunity side updates match on.
 */
export const marketMappingsLayer: Layer.Layer<MarketMappings, never, Database> = Layer.effect(
  MarketMappings,
  Effect.gen(function*() {
    const { db } = yield* Database

    const lookup = Effect.fn("MarketMappings.lookup")(function*(exchangeId: number, coingeckoId: string) {
      const rows = yield* db
        .select({
          cryptocurrencyId: cryptocurrencyTable.id,
          quoteCurrency: exchangeTable.baseCurrency
        })
        .from(exchangeCryptocurrencyTable)
        .innerJoin(
          cryptocurrencyTable,
          eq(cryptocurrencyTable.id, exchangeCryptocurrencyTable.cryptocurrencyId)
        )
        .innerJoin(exchangeTable, eq(exchangeTable.id, exchangeCryptocurrencyTable.exchangeId))
        .where(
          and(
            eq(exchangeCryptocurrencyTable.exchangeId, exchangeId),
            eq(cryptocurrencyTable.coingeckoId, coingeckoId)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)

      return Option.map(Option.fromIterable(rows), (row) => ({
        cryptocurrencyId: row.cryptocurrencyId,
        quoteCurrency: row.quoteCurrency
      }))
    })

    return MarketMappings.of({ lookup })
  })
)

/**
 * Drizzle adapter for {@link OpportunityStore}.
 *
 * `diffInit` reads the existing keys, inserts the missing ones at zero, and
 * deletes the ones no longer desired by primary key. Side updates are two
 * set-based statements keyed on the coin and the matching exchange column, so
 * one tick fans out to every row the exchange is on without touching the other
 * side.
 */
export const opportunityStoreLayer: Layer.Layer<OpportunityStore, never, Database> = Layer.effect(
  OpportunityStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const diffInit = Effect.fn("OpportunityStore.diffInit")(
      function*(desired: ReadonlyArray<OpportunityKey>) {
        const existing = yield* db
          .select({
            id: opportunityTable.id,
            cryptocurrencyId: opportunityTable.cryptocurrencyId,
            buyExchangeId: opportunityTable.buyExchangeId,
            sellExchangeId: opportunityTable.sellExchangeId
          })
          .from(opportunityTable)

        const desiredKeys = new Set(desired.map(keyOf))
        const existingKeys = new Set(existing.map(keyOf))

        const toInsert = desired.filter((key) => !existingKeys.has(keyOf(key)))
        const toDelete = existing.filter((row) => !desiredKeys.has(keyOf(row)))

        if (toInsert.length > 0) {
          yield* db
            .insert(opportunityTable)
            .values(toInsert.map((key) => ({ ...key })))
            .onConflictDoNothing()
        }

        if (toDelete.length > 0) {
          yield* db
            .delete(opportunityTable)
            .where(inArray(opportunityTable.id, toDelete.map((row) => row.id)))
        }
      },
      Effect.orDie
    )

    const applySides = Effect.fn("OpportunityStore.applySides")(
      function*(write: OpportunitySidesWrite) {
        if (write.buys.length === 0 && write.sells.length === 0) return

        yield* db.transaction((tx) =>
          Effect.gen(function*() {
            for (const update of write.buys) {
              yield* tx
                .update(opportunityTable)
                .set({
                  buyPrice: update.price,
                  buyVolume: update.volume,
                  buyTickTimestamp: update.tickTimestamp
                })
                .where(
                  and(
                    eq(opportunityTable.cryptocurrencyId, update.cryptocurrencyId),
                    eq(opportunityTable.buyExchangeId, update.exchangeId)
                  )
                )
            }

            for (const update of write.sells) {
              yield* tx
                .update(opportunityTable)
                .set({
                  sellPrice: update.price,
                  sellVolume: update.volume,
                  sellTickTimestamp: update.tickTimestamp
                })
                .where(
                  and(
                    eq(opportunityTable.cryptocurrencyId, update.cryptocurrencyId),
                    eq(opportunityTable.sellExchangeId, update.exchangeId)
                  )
                )
            }
          })
        ).pipe(Effect.orDie)
      }
    )

    return OpportunityStore.of({ diffInit, applySides })
  })
)

/**
 * Combined persistence adapter backing {@link TickIngestion}.
 */
export const layer: Layer.Layer<MarketMappings | OpportunityStore, never, Database> = Layer.mergeAll(
  marketMappingsLayer,
  opportunityStoreLayer
)
