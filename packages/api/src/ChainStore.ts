import { Database, chainTable } from "@lister/db"
import { Chain as ChainModel, type ChainId } from "@lister/domain"
import { and, asc, count, desc, eq, ilike } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Layer, Option } from "effect"
import { ChainStore, type ChainCreate, type ChainListQuery, type ChainUpdate } from "./Chain.ts"
import { ChainCodeExists } from "./ChainErrors.ts"
import { uniqueViolationConstraint } from "./DrizzleErrors.ts"
import { decodeRows } from "./RowDecoding.ts"

/**
 * Drizzle-backed implementation of the {@link ChainStore} port.
 *
 * All queries run through the `Database` service; raw rows are decoded into
 * domain models before crossing the port boundary, and Postgres unique
 * violations are translated into the application's duplicate errors.
 */
export const layer: Layer.Layer<ChainStore, never, Database> = Layer.effect(
  ChainStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const decodeChains = decodeRows(ChainModel)

    const listConditions = (query: ChainListQuery) => {
      const conditions = []

      if (query.search) {
        conditions.push(ilike(chainTable[query.searchBy], `%${query.search.toLowerCase()}%`))
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
      input: ChainCreate | ChainUpdate
    ): ChainCodeExists | undefined => {
      const constraint = uniqueViolationConstraint(error)

      if (Option.isNone(constraint)) return undefined

      if (constraint.value === "chain_code_unique" && input.code !== undefined) {
        return new ChainCodeExists({ code: input.code })
      }

      return undefined
    }

    const findById = Effect.fn("ChainStore.findById")(function*(id: ChainId) {
      const rows = yield* db.select().from(chainTable).where(eq(chainTable.id, id)).limit(1).pipe(Effect.orDie)

      return Option.fromIterable(decodeChains(rows))
    })

    const findByCode = Effect.fn("ChainStore.findByCode")(function*(code: string) {
      const rows = yield* db.select().from(chainTable).where(eq(chainTable.code, code)).limit(1).pipe(Effect.orDie)

      return Option.fromIterable(decodeChains(rows))
    })

    const list = Effect.fn("ChainStore.list")(
      function*(query: ChainListQuery) {
        const conditions = listConditions(query)
        const where = conditions.length > 0 ? and(...conditions) : undefined

        const orderBy = query.order === "asc" ? asc(chainTable[query.orderBy]) : desc(chainTable[query.orderBy])

        const totals = yield* db.select({ value: count() }).from(chainTable).where(where)
        const total = totals[0]?.value ?? 0

        const rows =
          query.limit === -1
            ? yield* db.select().from(chainTable).where(where).orderBy(orderBy)
            : yield* db
                .select()
                .from(chainTable)
                .where(where)
                .orderBy(orderBy)
                .limit(query.limit)
                .offset((query.page - 1) * query.limit)

        return { rows: decodeChains(rows), total }
      },
      Effect.orDie
    )

    const insert = Effect.fn("ChainStore.insert")(function*(input: ChainCreate) {
      const rows = yield* db
        .insert(chainTable)
        .values(input)
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      const created = decodeChains(rows)[0]

      if (created === undefined) {
        return yield* Effect.die(new Error("chain insert returned no row"))
      }

      return created
    })

    const update = Effect.fn("ChainStore.update")(function*(id: ChainId, input: ChainUpdate) {
      if (Object.keys(input).length === 0) {
        return yield* findById(id)
      }

      const rows = yield* db
        .update(chainTable)
        .set(input)
        .where(eq(chainTable.id, id))
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      return Option.fromIterable(decodeChains(rows))
    })

    const remove = Effect.fn("ChainStore.remove")(function*(id: ChainId) {
      const rows = yield* db.delete(chainTable).where(eq(chainTable.id, id)).returning().pipe(Effect.orDie)

      return Option.fromIterable(decodeChains(rows))
    })

    return ChainStore.of({
      list,
      findById,
      findByCode,
      insert,
      update,
      remove
    })
  })
)
