import { Database, cryptocurrencyTable, exchangeCryptocurrencyTable, opportunityTable } from "@lister/db"
import { and, eq, gt, gte } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { Clock, Effect, Layer } from "effect"
import { freshnessWindowMs, SignalRow, SignalStore } from "./Signal.ts"

const buyMarket = alias(exchangeCryptocurrencyTable, "signal_buy_market")

const sellMarket = alias(exchangeCryptocurrencyTable, "signal_sell_market")

const profitPercentOf = (buyPrice: number, sellPrice: number): number =>
  ((sellPrice - buyPrice) / buyPrice) * 100

const profitVolumeOf = (
  buyPrice: number,
  buyVolume: number,
  sellPrice: number,
  sellVolume: number
): number => {
  const buyBase = buyVolume / buyPrice
  const sellBase = sellVolume / sellPrice
  const base = buyBase < sellBase ? buyBase : sellBase

  return base * (sellPrice - buyPrice)
}

/**
 * Drizzle-backed implementation of the {@link SignalStore} port.
 *
 * The projection joins each opportunity to its coin and to the two
 * `exchange_cryptocurrency` rows that carry the exchange symbols, filters both
 * tick timestamps to the freshness window around the server clock, keeps only
 * profitable rows, and derives profit percent and volume in the mapping. No
 * floor and no limit are applied, so the snapshot is complete.
 */
export const layer: Layer.Layer<SignalStore, never, Database> = Layer.effect(
  SignalStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const project = Effect.gen(function*() {
      const now = yield* Clock.currentTimeMillis
      const cutoff = now - freshnessWindowMs

      const rows = yield* db
        .select({
          opportunityId: opportunityTable.id,
          symbol: cryptocurrencyTable.symbol,
          buyExchangeId: opportunityTable.buyExchangeId,
          buyExchangeSymbol: buyMarket.exchangeSymbol,
          buyPrice: opportunityTable.buyPrice,
          buyVolume: opportunityTable.buyVolume,
          buyTickTimestamp: opportunityTable.buyTickTimestamp,
          sellExchangeId: opportunityTable.sellExchangeId,
          sellExchangeSymbol: sellMarket.exchangeSymbol,
          sellPrice: opportunityTable.sellPrice,
          sellVolume: opportunityTable.sellVolume,
          sellTickTimestamp: opportunityTable.sellTickTimestamp
        })
        .from(opportunityTable)
        .innerJoin(
          cryptocurrencyTable,
          eq(cryptocurrencyTable.id, opportunityTable.cryptocurrencyId)
        )
        .innerJoin(
          buyMarket,
          and(
            eq(buyMarket.exchangeId, opportunityTable.buyExchangeId),
            eq(buyMarket.cryptocurrencyId, opportunityTable.cryptocurrencyId)
          )
        )
        .innerJoin(
          sellMarket,
          and(
            eq(sellMarket.exchangeId, opportunityTable.sellExchangeId),
            eq(sellMarket.cryptocurrencyId, opportunityTable.cryptocurrencyId)
          )
        )
        .where(
          and(
            gt(opportunityTable.buyPrice, 0),
            gt(opportunityTable.sellPrice, opportunityTable.buyPrice),
            gte(opportunityTable.buyTickTimestamp, cutoff),
            gte(opportunityTable.sellTickTimestamp, cutoff)
          )
        )
        .pipe(Effect.orDie)

      return rows.map((row): SignalRow => ({
        ...row,
        profitPercent: profitPercentOf(row.buyPrice, row.sellPrice),
        profitVolume: profitVolumeOf(
          row.buyPrice,
          row.buyVolume,
          row.sellPrice,
          row.sellVolume
        )
      }))
    }).pipe(Effect.withSpan("SignalStore.project"))

    return SignalStore.of({ project })
  })
)
