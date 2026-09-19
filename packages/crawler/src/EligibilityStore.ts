import { Database, cryptocurrencyTable, exchangeCryptocurrencyChainTable, exchangeCryptocurrencyTable, exchangeTable } from "@lister/db"
import { and, eq } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { Eligibility } from "./Reconciler.ts"

/**
 * Drizzle-backed implementation of the {@link Eligibility} port.
 *
 * The eligible set is recomputed from the database on every call, never cached:
 * a mapping is eligible when it is listed and trade-enabled and has at least one
 * chain link that allows both withdrawals and deposits. Duplicate rows produced
 * by multiple enabled chains are collapsed with `selectDistinct`.
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

    const coinsForExchange = Effect.fn("Eligibility.coinsForExchange")(function*(exchangeId: number) {
      const rows = yield* db
        .selectDistinct({
          symbol: cryptocurrencyTable.symbol,
          cmcId: cryptocurrencyTable.cmcId
        })
        .from(exchangeCryptocurrencyTable)
        .innerJoin(
          exchangeCryptocurrencyChainTable,
          and(
            eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, exchangeCryptocurrencyTable.id),
            eq(exchangeCryptocurrencyChainTable.withdrawEnabled, true),
            eq(exchangeCryptocurrencyChainTable.depositEnabled, true)
          )
        )
        .innerJoin(
          cryptocurrencyTable,
          eq(cryptocurrencyTable.id, exchangeCryptocurrencyTable.cryptocurrencyId)
        )
        .where(
          and(
            eq(exchangeCryptocurrencyTable.exchangeId, exchangeId),
            eq(exchangeCryptocurrencyTable.listed, true),
            eq(exchangeCryptocurrencyTable.tradeEnabled, true)
          )
        )
        .pipe(Effect.orDie)

      return rows
    })

    return Eligibility.of({ exchangeSlug, coinsForExchange })
  })
)
