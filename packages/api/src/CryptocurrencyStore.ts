import {
  ChainId,
  ChainLinkId,
  Cryptocurrency as CryptocurrencyModel,
  ExchangeId,
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
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  getTableName,
  gt,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL
} from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Layer, Option, Predicate, Schema } from "effect"
import {
  CryptocurrencyStore,
  defaultStatsSearchBy,
  type CryptocurrencyCreate,
  type CryptocurrencyExchangeListing,
  type CryptocurrencyListQuery,
  type CryptocurrencyListResult,
  type CryptocurrencySearchField,
  type CryptocurrencyStatsQuery,
  type CryptocurrencyStatsResult,
  type CryptocurrencyStatsSort,
  type CryptocurrencyUpdate
} from "./Cryptocurrency.ts"
import { CryptocurrencyCoingeckoIdExists, CryptocurrencySlugExists } from "./CryptocurrencyErrors.ts"
import { uniqueViolationConstraint } from "./DrizzleErrors.ts"
import { keysetKeys, keysetPredicate } from "./KeysetQuery.ts"
import { keysetListResult, pageListResult } from "./Pagination.ts"
import { decodeRows } from "./RowDecoding.ts"
import { literalLikePattern } from "./Search.ts"

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

    /**
     * Filters shared by the list and stats queries: coins listed on an
     * exchange and/or carrying a chain route.
     */
    const assignmentConditions = (query: {
      readonly exchangeId?: ExchangeId | undefined
      readonly chainId?: ChainId | undefined
    }): Array<SQL> => {
      const conditions: Array<SQL> = []

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

    const listConditions = (query: CryptocurrencyListQuery) => {
      const conditions = []

      if (query.search) {
        const pattern = literalLikePattern(query.search)
        const numeric = Number(query.search)

        const match = or(
          ...query.searchBy.map((field: CryptocurrencySearchField) =>
            field === "id"
              ? eq(cryptocurrencyTable.id, Number.isNaN(numeric) ? -1 : numeric)
              : ilike(cryptocurrencyTable[field], pattern)
          )
        )

        if (match !== undefined) conditions.push(match)
      }

      conditions.push(...assignmentConditions(query))

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
    ): CryptocurrencyCoingeckoIdExists | CryptocurrencySlugExists | undefined => {
      const constraint = uniqueViolationConstraint(error)

      if (Option.isNone(constraint)) return undefined

      const coingeckoId = "coingeckoId" in input ? input.coingeckoId : undefined
      const slug = "slug" in input ? input.slug : undefined

      if (constraint.value === "cryptocurrency_coingeckoId_unique" && coingeckoId !== undefined) {
        return new CryptocurrencyCoingeckoIdExists({ coingeckoId })
      }

      if (constraint.value === "cryptocurrency_slug_unique" && slug !== undefined) {
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

    const findByCoingeckoId = Effect.fn("CryptocurrencyStore.findByCoingeckoId")(function*(coingeckoId: string) {
      const rows = yield* db
        .select()
        .from(cryptocurrencyTable)
        .where(eq(cryptocurrencyTable.coingeckoId, coingeckoId))
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

    const list = Effect.fn("CryptocurrencyStore.list")(
      function*(query: CryptocurrencyListQuery): Effect.fn.Return<CryptocurrencyListResult, EffectDrizzleQueryError> {
        const conditions = listConditions(query)
        const where = conditions.length > 0 ? and(...conditions) : undefined

        const orderBy =
          query.order === "asc" ? asc(cryptocurrencyTable[query.orderBy]) : desc(cryptocurrencyTable[query.orderBy])

        if (Predicate.isTagged(query.window, "Page")) {
          const totals = yield* db.select({ value: count() }).from(cryptocurrencyTable).where(where)
          const total = totals[0]?.value ?? 0

          const rows =
            query.limit === -1
              ? yield* db.select().from(cryptocurrencyTable).where(where).orderBy(orderBy)
              : yield* db
                  .select()
                  .from(cryptocurrencyTable)
                  .where(where)
                  .orderBy(orderBy)
                  .limit(query.limit)
                  .offset((query.window.page - 1) * query.limit)

          return pageListResult({ rows: decodeCoins(rows), total, page: query.window.page })
        }

        const cursor = query.window.cursor

        const predicate = cursor === undefined
          ? undefined
          : keysetPredicate(
            keysetKeys(
              [
                { expression: cryptocurrencyTable[query.orderBy], direction: cursor.direction },
                { expression: cryptocurrencyTable.id, direction: "asc" }
              ],
              cursor.values
            )
          )

        const keysetWhere = predicate === undefined ? where : where === undefined ? predicate : and(where, predicate)

        if (query.limit === -1) {
          const rows = yield* db
            .select()
            .from(cryptocurrencyTable)
            .where(keysetWhere)
            .orderBy(orderBy, asc(cryptocurrencyTable.id))

          return keysetListResult({ rows: decodeCoins(rows), hasMore: false })
        }

        const rows = yield* db
          .select()
          .from(cryptocurrencyTable)
          .where(keysetWhere)
          .orderBy(orderBy, asc(cryptocurrencyTable.id))
          .limit(query.limit + 1)

        return keysetListResult({
          rows: decodeCoins(rows.slice(0, query.limit)),
          hasMore: rows.length > query.limit
        })
      },
      Effect.orDie
    )

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

    /**
     * Fully-qualified reference to the outer coin row.
     *
     * Columns interpolated into raw `sql` fragments render unqualified in a
     * select list, which would make the coverage subqueries resolve `id`
     * against their own aliases; the qualified reference keeps the correlation
     * pointing at the coin.
     */
    const coinIdRef = sql.raw(`"${getTableName(cryptocurrencyTable)}"."${cryptocurrencyTable.id.name}"`)

    // Column identifiers used inside the raw coverage fragments. They are
    // derived from the schema so a rename cannot silently drift.
    const marketCoinColumn = sql.identifier(exchangeCryptocurrencyTable.cryptocurrencyId.name)
    const marketIdColumn = sql.identifier(exchangeCryptocurrencyTable.id.name)
    const linkMarketColumn = sql.identifier(exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId.name)
    const linkChainColumn = sql.identifier(exchangeCryptocurrencyChainTable.chainId.name)
    const linkWithdrawColumn = sql.identifier(exchangeCryptocurrencyChainTable.withdrawEnabled.name)
    const linkDepositColumn = sql.identifier(exchangeCryptocurrencyChainTable.depositEnabled.name)

    /**
     * Number of market assignments for the coin in the current row.
     *
     * Coverage is computed as correlated scalar subqueries instead of a
     * load-everything pass: each subquery is evaluated only for the coins the
     * filter and page window select, so paging stays cheap while `chains` and
     * `blocked` still describe the full assignment set of the returned coins.
     * The stats query shape is documented on {@link listStats}.
     */
    const marketsCount = sql<number>`(
      select count(*) from ${exchangeCryptocurrencyTable} as stats_markets
      where stats_markets.${marketCoinColumn} = ${coinIdRef}
    )`.mapWith(Number)

    /**
     * Distinct chain ids reachable through the coin's markets.
     */
    const chainsCount = sql<number>`(
      select count(distinct stats_links.${linkChainColumn})
      from ${exchangeCryptocurrencyTable} as stats_markets
      join ${exchangeCryptocurrencyChainTable} as stats_links
        on stats_links.${linkMarketColumn} = stats_markets.${marketIdColumn}
      where stats_markets.${marketCoinColumn} = ${coinIdRef}
    )`.mapWith(Number)

    /**
     * Ordered market pairs with no transfer route in either direction: pair
     * `(a, b)` counts when no chain lets `a` withdraw into `b`'s deposit or
     * vice versa.
     */
    const blockedCount = sql<number>`(
      select count(*)
      from ${exchangeCryptocurrencyTable} as stats_from
      join ${exchangeCryptocurrencyTable} as stats_to
        on stats_to.${marketCoinColumn} = stats_from.${marketCoinColumn}
       and stats_to.${marketIdColumn} <> stats_from.${marketIdColumn}
      where stats_from.${marketCoinColumn} = ${coinIdRef}
        and not exists (
          select 1
          from ${exchangeCryptocurrencyChainTable} as stats_from_links
          join ${exchangeCryptocurrencyChainTable} as stats_to_links
            on stats_to_links.${linkChainColumn} = stats_from_links.${linkChainColumn}
          where stats_from_links.${linkMarketColumn} = stats_from.${marketIdColumn}
            and stats_to_links.${linkMarketColumn} = stats_to.${marketIdColumn}
            and (
              (stats_from_links.${linkWithdrawColumn} and stats_to_links.${linkDepositColumn})
              or (stats_from_links.${linkDepositColumn} and stats_to_links.${linkWithdrawColumn})
            )
        )
    )`.mapWith(Number)

    const StatsRow = CryptocurrencyModel.select.pipe(
      Schema.fieldsAssign({
        markets: Schema.Int,
        chains: Schema.Int,
        blocked: Schema.Int
      })
    )

    const decodeStats = decodeRows(StatsRow)

    /**
     * SQL expression for the requested stats sort.
     *
     * @param sortBy - Coverage count or `symbol`.
     * @returns The expression to order by.
     */
    const statsSortExpression = (sortBy: CryptocurrencyStatsSort) => {
      switch (sortBy) {
        case "markets":
          return marketsCount
        case "chains":
          return chainsCount
        case "blocked":
          return blockedCount
        case "symbol":
          return cryptocurrencyTable.symbol
      }
    }

    /**
     * Filter, sort, aggregate coverage, and page coins in SQL.
     *
     * The filter runs before the page window, so `items`/`pages` describe the
     * filtered set and sort keys are evaluated over every matching coin, not
     * just the returned rows. `markets`, `chains`, and `blocked` are
     * correlated aggregates over the coin's assignments (see the fragments
     * above); `blocked` is the same pairwise route definition the legacy
     * in-memory implementation and the SSR matrix use.
     */
    const listStats = Effect.fn("CryptocurrencyStore.listStats")(
      function*(query: CryptocurrencyStatsQuery): Effect.fn.Return<CryptocurrencyStatsResult, EffectDrizzleQueryError> {
        const conditions = assignmentConditions(query)
        const term = query.search.trim()

        if (term !== "") {
          const pattern = literalLikePattern(term)
          const numeric = Number(term)
          const match = or(
            ...(query.searchBy ?? defaultStatsSearchBy).map((field: CryptocurrencySearchField) =>
              field === "id"
                ? eq(cryptocurrencyTable.id, Number.isNaN(numeric) ? -1 : numeric)
                : ilike(cryptocurrencyTable[field], pattern)
            )
          )

          if (match !== undefined) conditions.push(match)
        }

        const sortExpression = statsSortExpression(query.sortBy)

        if (query.flag === "blocked") conditions.push(gt(blockedCount, 0))

        if (query.flag === "single") conditions.push(lte(marketsCount, 1))

        const where = conditions.length > 0 ? and(...conditions) : undefined

        const orderBy = query.sortBy === "symbol"
          ? [
            query.order === "asc" ? asc(cryptocurrencyTable.symbol) : desc(cryptocurrencyTable.symbol),
            asc(cryptocurrencyTable.id)
          ]
          : [
            query.order === "asc" ? asc(sortExpression) : desc(sortExpression),
            asc(cryptocurrencyTable.symbol),
            asc(cryptocurrencyTable.id)
          ]

        const selection = {
          ...getTableColumns(cryptocurrencyTable),
          markets: marketsCount,
          chains: chainsCount,
          blocked: blockedCount
        }

        if (Predicate.isTagged(query.window, "Page")) {
          const totals = yield* db.select({ value: count() }).from(cryptocurrencyTable).where(where)
          const total = totals[0]?.value ?? 0

          const rows =
            query.limit === -1
              ? yield* db.select(selection).from(cryptocurrencyTable).where(where).orderBy(...orderBy)
              : yield* db
                  .select(selection)
                  .from(cryptocurrencyTable)
                  .where(where)
                  .orderBy(...orderBy)
                  .limit(query.limit)
                  .offset((query.window.page - 1) * query.limit)

          return pageListResult({ rows: decodeStats(rows), total, page: query.window.page })
        }

        const cursor = query.window.cursor

        const predicate = cursor === undefined
          ? undefined
          : keysetPredicate(
            keysetKeys(
              query.sortBy === "symbol"
                ? [
                  { expression: cryptocurrencyTable.symbol, direction: cursor.direction },
                  { expression: cryptocurrencyTable.id, direction: "asc" }
                ]
                : [
                  { expression: sortExpression, direction: cursor.direction },
                  { expression: cryptocurrencyTable.symbol, direction: "asc" },
                  { expression: cryptocurrencyTable.id, direction: "asc" }
                ],
              cursor.values
            )
          )

        const keysetWhere = predicate === undefined ? where : where === undefined ? predicate : and(where, predicate)

        if (query.limit === -1) {
          const rows = yield* db.select(selection).from(cryptocurrencyTable).where(keysetWhere).orderBy(...orderBy)

          return keysetListResult({ rows: decodeStats(rows), hasMore: false })
        }

        const rows = yield* db
          .select(selection)
          .from(cryptocurrencyTable)
          .where(keysetWhere)
          .orderBy(...orderBy)
          .limit(query.limit + 1)

        return keysetListResult({
          rows: decodeStats(rows.slice(0, query.limit)),
          hasMore: rows.length > query.limit
        })
      },
      Effect.orDie
    )

    const CryptocurrencyListingRow = Schema.Struct({
      exchangeId: ExchangeId,
      exchangeName: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
      exchangeSlug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
      exchangeSymbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
      marketId: MarketId,
      listed: Schema.Boolean,
      tradeEnabled: Schema.Boolean,
      chainId: Schema.NullOr(ChainId),
      chainName: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))),
      chainCode: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))),
      linkId: Schema.NullOr(ChainLinkId),
      exchangeChainCode: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))),
      exchangeChainName: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))),
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
      listStats,
      findById,
      findByCoingeckoId,
      findBySlug,
      insert,
      update,
      remove,
      listListings
    })
  })
)
