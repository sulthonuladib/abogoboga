import {
  Database,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable,
  orderbookSnapshotTable
} from "@lister/db"
import { and, eq } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { MarketMappings, OrderbookSnapshots, type OrderbookSnapshotWrite } from "./TickIngestion.ts"

/**
 * Drizzle adapter for {@link MarketMappings}.
 *
 * Resolves a tick's CoinMarketCap id against the exchange's coin mapping and
 * reads the exchange's quote currency in the same query.
 */
export const marketMappingsLayer: Layer.Layer<MarketMappings, never, Database> = Layer.effect(
  MarketMappings,
  Effect.gen(function*() {
    const { db } = yield* Database

    const lookup = Effect.fn("MarketMappings.lookup")(function*(exchangeId: number, coingeckoId: string) {
      const rows = yield* db
        .select({
          exchangeCryptocurrencyId: exchangeCryptocurrencyTable.id,
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
        exchangeCryptocurrencyId: row.exchangeCryptocurrencyId,
        quoteCurrency: row.quoteCurrency
      }))
    })

    return MarketMappings.of({ lookup })
  })
)

/**
 * Drizzle adapter for {@link OrderbookSnapshots}.
 *
 * Upserts on the mapping's unique key, replacing executable quote columns and
 * the tick timestamp so a newer tick always wins.
 */
export const orderbookSnapshotsLayer: Layer.Layer<OrderbookSnapshots, never, Database> = Layer.effect(
  OrderbookSnapshots,
  Effect.gen(function*() {
    const { db } = yield* Database

    const upsert = Effect.fn("OrderbookSnapshots.upsert")(function*(snapshot: OrderbookSnapshotWrite) {
      yield* db
        .insert(orderbookSnapshotTable)
        .values(snapshot)
        .onConflictDoUpdate({
          target: orderbookSnapshotTable.exchangeCryptocurrencyId,
          set: {
            exchangeId: snapshot.exchangeId,
            buyPrice: snapshot.buyPrice,
            sellPrice: snapshot.sellPrice,
            buyAmount: snapshot.buyAmount,
            sellAmount: snapshot.sellAmount,
            tickTimestamp: snapshot.tickTimestamp
          }
        })
        .pipe(Effect.orDie)
    })

    return OrderbookSnapshots.of({ upsert })
  })
)

/**
 * Combined persistence adapter backing {@link TickIngestion}.
 */
export const layer: Layer.Layer<MarketMappings | OrderbookSnapshots, never, Database> = Layer.mergeAll(
  marketMappingsLayer,
  orderbookSnapshotsLayer
)
