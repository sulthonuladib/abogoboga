import { Database, cryptocurrencyTable, exchangeCryptocurrencyTable, exchangeTable } from "@lister/db"
import {
  Cryptocurrency as CryptocurrencyModel,
  type CryptocurrencyId,
  Exchange as ExchangeModel,
  type ExchangeId,
  Market as MarketModel,
  type MarketId
} from "@lister/domain"
import { and, count as drizzleCount, eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Layer, Option } from "effect"
import { uniqueViolationConstraint } from "./DrizzleErrors.ts"
import { MarketStore, type MarketCreate, type MarketListQuery, type MarketUpdate } from "./Market.ts"
import { MarketExists } from "./MarketErrors.ts"
import { decodeRows } from "./RowDecoding.ts"

/**
 * Drizzle-backed implementation of the {@link MarketStore} port.
 *
 * All queries run through the `Database` service; raw rows are decoded into
 * domain models before crossing the port boundary, and Postgres unique
 * violations are translated into the application's duplicate errors.
 */
export const layer: Layer.Layer<MarketStore, never, Database> = Layer.effect(
  MarketStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const decodeMarkets = decodeRows(MarketModel)
    const decodeExchanges = decodeRows(ExchangeModel)
    const decodeCryptocurrencies = decodeRows(CryptocurrencyModel)

    const listConditions = (query: MarketListQuery) => {
      const conditions = []

      if (query.exchangeId !== undefined) {
        conditions.push(eq(exchangeCryptocurrencyTable.exchangeId, query.exchangeId))
      }

      if (query.cryptocurrencyId !== undefined) {
        conditions.push(eq(exchangeCryptocurrencyTable.cryptocurrencyId, query.cryptocurrencyId))
      }

      return conditions
    }

    /**
     * Translate a Postgres unique violation into the precise duplicate error.
     * Returns `undefined` for every other query failure, which stays a defect.
     *
     * @param error - Drizzle query error raised by the insert or update.
     * @param input - Values that were written, used to fill the conflict.
     * @returns The duplicate error, or `undefined` when it is not a unique conflict.
     */
    const uniqueConflict = (
      error: EffectDrizzleQueryError,
      input: MarketCreate | MarketUpdate
    ): MarketExists | undefined => {
      const constraint = uniqueViolationConstraint(error)

      if (Option.isNone(constraint)) return undefined

      if (
        constraint.value === "exchange_cryptocurrency_exchange_crypto_unique" &&
        input.exchangeId !== undefined &&
        input.cryptocurrencyId !== undefined
      ) {
        return new MarketExists({ exchangeId: input.exchangeId, cryptocurrencyId: input.cryptocurrencyId })
      }

      return undefined
    }

    const list = Effect.fn("MarketStore.list")(function*(query: MarketListQuery) {
      const conditions = listConditions(query)
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = yield* db.select().from(exchangeCryptocurrencyTable).where(where).pipe(Effect.orDie)

      return decodeMarkets(rows)
    })

    const count = Effect.fn("MarketStore.count")(function*(query: MarketListQuery) {
      const conditions = listConditions(query)
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const totals = yield* db
        .select({ value: drizzleCount() })
        .from(exchangeCryptocurrencyTable)
        .where(where)
        .pipe(Effect.orDie)

      return totals[0]?.value ?? 0
    })

    const findById = Effect.fn("MarketStore.findById")(function*(id: MarketId) {
      const rows = yield* db
        .select()
        .from(exchangeCryptocurrencyTable)
        .where(eq(exchangeCryptocurrencyTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeMarkets(rows))
    })

    const findExchange = Effect.fn("MarketStore.findExchange")(function*(id: ExchangeId) {
      const rows = yield* db.select().from(exchangeTable).where(eq(exchangeTable.id, id)).limit(1).pipe(Effect.orDie)

      return Option.fromIterable(decodeExchanges(rows))
    })

    const findCryptocurrency = Effect.fn("MarketStore.findCryptocurrency")(function*(id: CryptocurrencyId) {
      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeCryptocurrencies(rows))
    })

    const findByPair = Effect.fn("MarketStore.findByPair")(function*(
      exchangeId: ExchangeId,
      cryptocurrencyId: CryptocurrencyId
    ) {
      const rows = yield* db
        .select()
        .from(exchangeCryptocurrencyTable)
        .where(
          and(
            eq(exchangeCryptocurrencyTable.exchangeId, exchangeId),
            eq(exchangeCryptocurrencyTable.cryptocurrencyId, cryptocurrencyId)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeMarkets(rows))
    })

    const insert = Effect.fn("MarketStore.insert")(function*(input: MarketCreate) {
      const rows = yield* db
        .insert(exchangeCryptocurrencyTable)
        .values(input)
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      const created = decodeMarkets(rows)[0]

      if (created === undefined) {
        return yield* Effect.die(new Error("market insert returned no row"))
      }

      return created
    })

    const update = Effect.fn("MarketStore.update")(function*(id: MarketId, input: MarketUpdate) {
      if (Object.keys(input).length === 0) {
        return yield* findById(id)
      }

      const rows = yield* db
        .update(exchangeCryptocurrencyTable)
        .set(input)
        .where(eq(exchangeCryptocurrencyTable.id, id))
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      return Option.fromIterable(decodeMarkets(rows))
    })

    const remove = Effect.fn("MarketStore.remove")(function*(id: MarketId) {
      const rows = yield* db
        .delete(exchangeCryptocurrencyTable)
        .where(eq(exchangeCryptocurrencyTable.id, id))
        .returning()
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeMarkets(rows))
    })

    return MarketStore.of({
      list,
      count,
      findById,
      findExchange,
      findCryptocurrency,
      findByPair,
      insert,
      update,
      remove
    })
  })
)
