import { Database, chainTable, exchangeCryptocurrencyChainTable, exchangeCryptocurrencyTable } from "@lister/db"
import {
  Chain as ChainModel,
  type ChainId,
  ChainLink as ChainLinkModel,
  type ChainLinkId,
  Market as MarketModel,
  type MarketId
} from "@lister/domain"
import { and, eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Layer, Option } from "effect"
import { ChainLinkStore, type ChainLinkCreate, type ChainLinkListQuery, type ChainLinkUpdate } from "./ChainLink.ts"
import { ChainLinkExists } from "./ChainLinkErrors.ts"
import { uniqueViolationConstraint } from "./DrizzleErrors.ts"
import { decodeRows } from "./RowDecoding.ts"

/**
 * Drizzle-backed implementation of the {@link ChainLinkStore} port.
 *
 * All queries run through the `Database` service; raw rows are decoded into
 * domain models before crossing the port boundary, and Postgres unique
 * violations are translated into the application's duplicate errors.
 */
export const layer: Layer.Layer<ChainLinkStore, never, Database> = Layer.effect(
  ChainLinkStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const decodeChainLinks = decodeRows(ChainLinkModel)
    const decodeMarkets = decodeRows(MarketModel)
    const decodeChains = decodeRows(ChainModel)

    const listConditions = (query: ChainLinkListQuery) => {
      const conditions = []

      if (query.exchangeCryptocurrencyId !== undefined) {
        conditions.push(eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, query.exchangeCryptocurrencyId))
      }

      if (query.chainId !== undefined) {
        conditions.push(eq(exchangeCryptocurrencyChainTable.chainId, query.chainId))
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
      input: ChainLinkCreate | ChainLinkUpdate
    ): ChainLinkExists | undefined => {
      const constraint = uniqueViolationConstraint(error)

      if (Option.isNone(constraint)) return undefined

      if (
        constraint.value === "exchange_cryptocurrency_chain_unique" &&
        input.exchangeCryptocurrencyId !== undefined &&
        input.chainId !== undefined
      ) {
        return new ChainLinkExists({
          exchangeCryptocurrencyId: input.exchangeCryptocurrencyId,
          chainId: input.chainId
        })
      }

      return undefined
    }

    const list = Effect.fn("ChainLinkStore.list")(function*(query: ChainLinkListQuery) {
      const conditions = listConditions(query)
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const rows = yield* db.select().from(exchangeCryptocurrencyChainTable).where(where).pipe(Effect.orDie)

      return decodeChainLinks(rows)
    })

    const findById = Effect.fn("ChainLinkStore.findById")(function*(id: ChainLinkId) {
      const rows = yield* db
        .select()
        .from(exchangeCryptocurrencyChainTable)
        .where(eq(exchangeCryptocurrencyChainTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeChainLinks(rows))
    })

    const findMarket = Effect.fn("ChainLinkStore.findMarket")(function*(id: MarketId) {
      const rows = yield* db
        .select()
        .from(exchangeCryptocurrencyTable)
        .where(eq(exchangeCryptocurrencyTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeMarkets(rows))
    })

    const findChain = Effect.fn("ChainLinkStore.findChain")(function*(id: ChainId) {
      const rows = yield* db.select().from(chainTable).where(eq(chainTable.id, id)).limit(1).pipe(Effect.orDie)

      return Option.fromIterable(decodeChains(rows))
    })

    const findByPair = Effect.fn("ChainLinkStore.findByPair")(function*(marketId: MarketId, chainId: ChainId) {
      const rows = yield* db
        .select()
        .from(exchangeCryptocurrencyChainTable)
        .where(
          and(
            eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, marketId),
            eq(exchangeCryptocurrencyChainTable.chainId, chainId)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeChainLinks(rows))
    })

    const insert = Effect.fn("ChainLinkStore.insert")(function*(input: ChainLinkCreate) {
      const rows = yield* db
        .insert(exchangeCryptocurrencyChainTable)
        .values(input)
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      const created = decodeChainLinks(rows)[0]

      if (created === undefined) {
        return yield* Effect.die(new Error("chain link insert returned no row"))
      }

      return created
    })

    const update = Effect.fn("ChainLinkStore.update")(function*(id: ChainLinkId, input: ChainLinkUpdate) {
      if (Object.keys(input).length === 0) {
        return yield* findById(id)
      }

      const rows = yield* db
        .update(exchangeCryptocurrencyChainTable)
        .set(input)
        .where(eq(exchangeCryptocurrencyChainTable.id, id))
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      return Option.fromIterable(decodeChainLinks(rows))
    })

    const remove = Effect.fn("ChainLinkStore.remove")(function*(id: ChainLinkId) {
      const rows = yield* db
        .delete(exchangeCryptocurrencyChainTable)
        .where(eq(exchangeCryptocurrencyChainTable.id, id))
        .returning()
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeChainLinks(rows))
    })

    return ChainLinkStore.of({
      list,
      findById,
      findMarket,
      findChain,
      findByPair,
      insert,
      update,
      remove
    })
  })
)
