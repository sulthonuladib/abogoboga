import {
  ChainId,
  ChainLink,
  ChainLinkId,
  Cryptocurrency as CryptocurrencyModel,
  ExchangeId,
  Market,
  MarketId,
  type CryptocurrencyId
} from "@lister/domain"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Effect, Layer, Option, Schema } from "effect"
import { SqlError, UniqueViolation } from "effect/unstable/sql/SqlError"
import {
  CryptocurrencyStore,
  type CryptocurrencyCreate,
  type CryptocurrencyExchangeListing,
  type CryptocurrencyListQuery,
  type CryptocurrencyUpdate
} from "./Cryptocurrency.ts"
import { CryptocurrencyCmcIdExists, CryptocurrencySlugExists } from "./CryptocurrencyErrors.ts"

/**
 * Decode a raw database row into its domain model.
 *
 * Invalid rows are defects: the table shape and the model are defined
 * together, so a mismatch means the migration and code are out of sync.
 *
 * @param schema - Model schema to decode rows with.
 * @returns A mapping function from encoded rows to model instances.
 */
const decodeRows =
  <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
  (rows: ReadonlyArray<S["Encoded"]>): ReadonlyArray<S["Type"]> =>
    Schema.decodeUnknownSync(Schema.Array(schema))(rows)

/**
 * Drizzle-backed implementation of the {@link CryptocurrencyStore} port.
 *
 * All queries run through the `Database` service; raw rows are decoded into
 * domain models before crossing the port boundary, and Postgres unique
 * violations are translated into the application's duplicate errors.
 */
export const layer: Layer.Layer<CryptocurrencyStore, never, Database> = Layer.effect(
  CryptocurrencyStore,
  Effect.gen(function*() {
    const { db } = yield* Database

    const decodeCoins = decodeRows(CryptocurrencyModel)
    const decodeMarkets = decodeRows(Market)
    const decodeLinks = decodeRows(ChainLink)

    const listConditions = (query: CryptocurrencyListQuery) => {
      const conditions = []

      if (query.search) {
        if (query.searchBy === "id" || query.searchBy === "cmcId") {
          const numeric = Number(query.search)

          conditions.push(eq(cryptocurrencyTable[query.searchBy], Number.isNaN(numeric) ? -1 : numeric))
        } else {
          conditions.push(ilike(cryptocurrencyTable[query.searchBy], `%${query.search.toLowerCase()}%`))
        }
      }

      if (query.exchangeId !== undefined) {
        conditions.push(
          inArray(
            cryptocurrencyTable.id,
            db
              .select({ id: exchangeCryptocurrencyTable.cryptocurrencyId })
              .from(exchangeCryptocurrencyTable)
              .where(eq(exchangeCryptocurrencyTable.exchangeId, query.exchangeId))
          )
        )
      }

      if (query.chainId !== undefined) {
        conditions.push(
          inArray(
            cryptocurrencyTable.id,
            db
              .select({ id: exchangeCryptocurrencyTable.cryptocurrencyId })
              .from(exchangeCryptocurrencyTable)
              .innerJoin(
                exchangeCryptocurrencyChainTable,
                eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, exchangeCryptocurrencyTable.id)
              )
              .where(eq(exchangeCryptocurrencyChainTable.chainId, query.chainId))
          )
        )
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
      input: CryptocurrencyCreate | CryptocurrencyUpdate
    ): CryptocurrencyCmcIdExists | CryptocurrencySlugExists | undefined => {
      if (!Cause.isCause(error.cause)) return undefined

      const sqlError = Cause.findErrorOption(error.cause)

      if (Option.isNone(sqlError) || !(sqlError.value instanceof SqlError)) return undefined

      if (!(sqlError.value.reason instanceof UniqueViolation)) return undefined

      const constraint = sqlError.value.reason.constraint
      const cmcId = "cmcId" in input ? input.cmcId : undefined
      const slug = "slug" in input ? input.slug : undefined

      if (constraint === "cryptocurrency_cmcId_unique" && cmcId !== undefined) {
        return new CryptocurrencyCmcIdExists({ cmcId })
      }

      if (constraint === "cryptocurrency_slug_unique" && slug !== undefined) {
        return new CryptocurrencySlugExists({ slug })
      }

      return undefined
    }

    const findById = Effect.fn("CryptocurrencyStore.findById")(function*(id: CryptocurrencyId) {
      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.id, id))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeCoins(rows))
    })

    const findByCmcId = Effect.fn("CryptocurrencyStore.findByCmcId")(function*(cmcId: number) {
      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.cmcId, cmcId))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeCoins(rows))
    })

    const findBySlug = Effect.fn("CryptocurrencyStore.findBySlug")(function*(slug: string) {
      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.slug, slug))
        .limit(1)
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeCoins(rows))
    })

    const list = Effect.fn("CryptocurrencyStore.list")(function*(query: CryptocurrencyListQuery) {
      const conditions = listConditions(query)
      const where = conditions.length > 0 ? and(...conditions) : undefined

      const orderBy =
        query.order === "asc" ? asc(cryptocurrencyTable[query.orderBy]) : desc(cryptocurrencyTable[query.orderBy])

      const totals = yield* db.select({ value: count() }).from(cryptocurrencyTable).where(where).pipe(Effect.orDie)
      const total = totals[0]?.value ?? 0

      const rows =
        query.limit === -1
          ? yield* db.select().from(cryptocurrencyTable).where(where).orderBy(orderBy).pipe(Effect.orDie)
          : yield* db
              .select()
              .from(cryptocurrencyTable)
              .where(where)
              .orderBy(orderBy)
              .limit(query.limit)
              .offset((query.page - 1) * query.limit)
              .pipe(Effect.orDie)

      return { rows: decodeCoins(rows), total }
    })

    const insert = Effect.fn("CryptocurrencyStore.insert")(function*(input: CryptocurrencyCreate) {
      const rows = yield* db
        .insert(cryptocurrencyTable)
        .values(input)
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      const created = decodeCoins(rows)[0]

      if (created === undefined) {
        return yield* Effect.die(new Error("cryptocurrency insert returned no row"))
      }

      return created
    })

    const update = Effect.fn("CryptocurrencyStore.update")(function*(
      id: CryptocurrencyId,
      input: CryptocurrencyUpdate
    ) {
      if (Object.keys(input).length === 0) {
        return yield* findById(id)
      }

      const rows = yield* db
        .update(cryptocurrencyTable)
        .set(input)
        .where(eq(cryptocurrencyTable.id, id))
        .returning()
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", (error) => {
            const conflict = uniqueConflict(error, input)

            return conflict === undefined ? Effect.die(error) : Effect.fail(conflict)
          })
        )

      return Option.fromIterable(decodeCoins(rows))
    })

    const remove = Effect.fn("CryptocurrencyStore.remove")(function*(id: CryptocurrencyId) {
      const rows = yield* db
        .delete(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.id, id))
        .returning()
        .pipe(Effect.orDie)

      return Option.fromIterable(decodeCoins(rows))
    })

    const searchCoins = Effect.fn("CryptocurrencyStore.searchCoins")(function*(search: string) {
      const term = search.trim()

      if (term === "") {
        return decodeCoins(yield* db.select().from(cryptocurrencyTable).pipe(Effect.orDie))
      }

      const pattern = `%${term.toLowerCase()}%`

      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(or(ilike(cryptocurrencyTable.symbol, pattern), ilike(cryptocurrencyTable.name, pattern)))
        .pipe(Effect.orDie)

      return decodeCoins(rows)
    })

    const listAllMarkets = Effect.gen(function*() {
      return decodeMarkets(yield* db.select().from(exchangeCryptocurrencyTable).pipe(Effect.orDie))
    })

    const listAllChainLinks = Effect.gen(function*() {
      return decodeLinks(yield* db.select().from(exchangeCryptocurrencyChainTable).pipe(Effect.orDie))
    })

    const CryptocurrencyListingRow = Schema.Struct({
      exchangeId: ExchangeId,
      exchangeName: Schema.String,
      exchangeSlug: Schema.String,
      exchangeSymbol: Schema.String,
      marketId: MarketId,
      listed: Schema.Boolean,
      tradeEnabled: Schema.Boolean,
      chainId: Schema.NullOr(ChainId),
      chainName: Schema.NullOr(Schema.String),
      chainCode: Schema.NullOr(Schema.String),
      linkId: Schema.NullOr(ChainLinkId),
      exchangeChainCode: Schema.NullOr(Schema.String),
      exchangeChainName: Schema.NullOr(Schema.String),
      withdrawEnabled: Schema.NullOr(Schema.Boolean),
      depositEnabled: Schema.NullOr(Schema.Boolean)
    })

    const decodeListingRows = decodeRows(CryptocurrencyListingRow)

    const listListings = Effect.fn("CryptocurrencyStore.listListings")(function*(
      id: CryptocurrencyId
    ): Effect.fn.Return<ReadonlyArray<CryptocurrencyExchangeListing>> {
      const rows = yield* db
        .select({
          exchangeId: exchangeTable.id,
          exchangeName: exchangeTable.name,
          exchangeSlug: exchangeTable.slug,
          exchangeSymbol: exchangeCryptocurrencyTable.exchangeSymbol,
          marketId: exchangeCryptocurrencyTable.id,
          listed: exchangeCryptocurrencyTable.listed,
          tradeEnabled: exchangeCryptocurrencyTable.tradeEnabled,
          chainId: chainTable.id,
          chainName: chainTable.name,
          chainCode: chainTable.code,
          linkId: exchangeCryptocurrencyChainTable.id,
          exchangeChainCode: exchangeCryptocurrencyChainTable.exchangeChainCode,
          exchangeChainName: exchangeCryptocurrencyChainTable.exchangeChainName,
          withdrawEnabled: exchangeCryptocurrencyChainTable.withdrawEnabled,
          depositEnabled: exchangeCryptocurrencyChainTable.depositEnabled
        })
        .from(exchangeCryptocurrencyTable)
        .innerJoin(exchangeTable, eq(exchangeTable.id, exchangeCryptocurrencyTable.exchangeId))
        .leftJoin(
          exchangeCryptocurrencyChainTable,
          eq(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId, exchangeCryptocurrencyTable.id)
        )
        .leftJoin(chainTable, eq(chainTable.id, exchangeCryptocurrencyChainTable.chainId))
        .where(eq(exchangeCryptocurrencyTable.cryptocurrencyId, id))
        .pipe(Effect.orDie)

      const listings: Array<CryptocurrencyExchangeListing> = []

      for (const row of decodeListingRows(rows)) {
        const chain =
          row.linkId === null ||
          row.chainId === null ||
          row.chainName === null ||
          row.chainCode === null ||
          row.exchangeChainCode === null ||
          row.withdrawEnabled === null ||
          row.depositEnabled === null
            ? Option.none()
            : Option.some({
                id: row.chainId,
                name: row.chainName,
                code: row.chainCode,
                linkId: row.linkId,
                exchangeChainCode: row.exchangeChainCode,
                exchangeChainName: row.exchangeChainName,
                withdrawEnabled: row.withdrawEnabled,
                depositEnabled: row.depositEnabled
              })

        listings.push({
          exchangeId: row.exchangeId,
          exchangeName: row.exchangeName,
          exchangeSlug: row.exchangeSlug,
          exchangeSymbol: row.exchangeSymbol,
          marketId: row.marketId,
          listed: row.listed,
          tradeEnabled: row.tradeEnabled,
          chain
        })
      }

      return listings
    })

    return CryptocurrencyStore.of({
      list,
      findById,
      findByCmcId,
      findBySlug,
      insert,
      update,
      remove,
      searchCoins,
      listAllMarkets,
      listAllChainLinks,
      listListings
    })
  })
)
