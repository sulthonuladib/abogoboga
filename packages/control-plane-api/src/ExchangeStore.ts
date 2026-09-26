import { Database, exchangeTable } from "@lister/db"
import { Exchange as ExchangeModel, type ExchangeId } from "@lister/domain"
import { and, asc, count, desc, eq, ilike } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Layer, Option } from "effect"
import { uniqueViolationConstraint } from "./DrizzleErrors.ts"
import {
  ExchangeStore,
  type ExchangeCreate,
  type ExchangeListQuery,
  type ExchangeUpdate
} from "./Exchange.ts"
import { ExchangeCoingeckoIdExists, ExchangeSlugExists } from "./ExchangeErrors.ts"
import { decodeRows } from "./RowDecoding.ts"

/**
 * Drizzle-backed implementation of the {@link ExchangeStore} port.
 *
 * All queries run through the `Database` service; raw rows are decoded into
 * domain models before crossing the port boundary, and Postgres unique
 * violations are translated into the application's duplicate errors.
 */
export const layer: Layer.Layer<ExchangeStore, never, Database> = Layer.effect(
  ExchangeStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const decodeExchanges = decodeRows(ExchangeModel)

    const listConditions = (query: ExchangeListQuery) => {
      const conditions = []

      if (query.search) {
        if (query.searchBy === "id") {
          const numeric = Number(query.search)

          conditions.push(eq(exchangeTable.id, Number.isNaN(numeric) ? -1 : numeric))
        } else {
          conditions.push(ilike(exchangeTable[query.searchBy], `%${query.search.toLowerCase()}%`))
        }
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
      input: ExchangeCreate | ExchangeUpdate
    ): ExchangeCoingeckoIdExists | ExchangeSlugExists | undefined => {
      const constraint = uniqueViolationConstraint(error)

      if (Option.isNone(constraint)) return undefined

      if (constraint.value === "exchange_coingeckoId_unique" && input.coingeckoId !== undefined) {
        return new ExchangeCoingeckoIdExists({ coingeckoId: input.coingeckoId })
      }

      if (constraint.value === "exchange_slug_unique" && input.slug !== undefined) {
        return new ExchangeSlugExists({ slug: input.slug })
      }

      return undefined
    }

    const findById = Effect.fn("ExchangeStore.findById")(function*(id: ExchangeId) {
      const rows = yield* db
        .select()
        .from(exchangeTable)
        .where(eq(exchangeTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeExchanges(rows))
    })

    const findByCoingeckoId = Effect.fn("ExchangeStore.findByCoingeckoId")(function*(coingeckoId: string) {
      const rows = yield* db
        .select()
        .from(exchangeTable)
        .where(eq(exchangeTable.coingeckoId, coingeckoId))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeExchanges(rows))
    })

    const findBySlug = Effect.fn("ExchangeStore.findBySlug")(function*(slug: string) {
      const rows = yield* db
        .select()
        .from(exchangeTable)
        .where(eq(exchangeTable.slug, slug))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeExchanges(rows))
    })

    const list = Effect.fn("ExchangeStore.list")(
      function*(query: ExchangeListQuery) {
        const conditions = listConditions(query)
        const where = conditions.length > 0 ? and(...conditions) : undefined

        const orderBy = query.order === "asc" ? asc(exchangeTable[query.orderBy]) : desc(exchangeTable[query.orderBy])

        const totals = yield* db.select({ value: count() }).from(exchangeTable).where(where)
        const total = totals[0]?.value ?? 0

        const rows =
          query.limit === -1
            ? yield* db.select().from(exchangeTable).where(where).orderBy(orderBy)
            : yield* db
                .select()
                .from(exchangeTable)
                .where(where)
                .orderBy(orderBy)
                .limit(query.limit)
                .offset((query.page - 1) * query.limit)

        return { rows: decodeExchanges(rows), total }
      },
      Effect.orDie
    )

    const insert = Effect.fn("ExchangeStore.insert")(function*(input: ExchangeCreate) {
      const rows = yield* db
        .insert(exchangeTable)
        .values(input)
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      const created = decodeExchanges(rows)[0]

      if (created === undefined) {
        return yield* Effect.die(new Error("exchange insert returned no row"))
      }

      return created
    })

    const update = Effect.fn("ExchangeStore.update")(function*(id: ExchangeId, input: ExchangeUpdate) {
      if (Object.keys(input).length === 0) {
        return yield* findById(id)
      }

      const rows = yield* db
        .update(exchangeTable)
        .set(input)
        .where(eq(exchangeTable.id, id))
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      return Option.fromIterable(decodeExchanges(rows))
    })

    const remove = Effect.fn("ExchangeStore.remove")(function*(id: ExchangeId) {
      const rows = yield* db
        .delete(exchangeTable)
        .where(eq(exchangeTable.id, id))
        .returning()
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeExchanges(rows))
    })

    return ExchangeStore.of({
      list,
      findById,
      findByCoingeckoId,
      findBySlug,
      insert,
      update,
      remove
    })
  })
)
