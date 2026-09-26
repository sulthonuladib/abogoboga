import { Exchange as ExchangeModel, type ExchangeId } from "@lister/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import {
  ExchangeCoingeckoIdExists,
  ExchangeError,
  ExchangeNotFound,
  ExchangeSlugExists
} from "./ExchangeErrors.ts"
import {
  type ListResult,
  type ListWindow,
  type PaginationMeta,
  encodeCursor,
  keysetMeta,
  paginationMeta,
  toCursorValue
} from "./Pagination.ts"

/**
 * Fields accepted when creating an exchange.
 */
export type ExchangeCreate = typeof ExchangeModel.jsonCreate.Type

/**
 * Fields accepted when updating an exchange.
 */
export type ExchangeUpdate = typeof ExchangeModel.jsonUpdate.Type

/**
 * Exchange fields that text search can target.
 */
export const ExchangeSearchField = Schema.Literals(["id", "name", "slug", "coingeckoId"])

/**
 * Decoded exchange search field.
 */
export type ExchangeSearchField = typeof ExchangeSearchField.Type

/**
 * Exchange fields that list results can be ordered by.
 */
export const ExchangeOrderField = Schema.Literals(["id", "coingeckoId", "name", "slug", "createdAt", "updatedAt"])

/**
 * Decoded exchange order field.
 */
export type ExchangeOrderField = typeof ExchangeOrderField.Type

/**
 * Query accepted by {@link Exchange.list}.
 *
 * `window` selects offset paging (`Page`) or keyset paging (`Keyset`);
 * `searchBy` lists every field the search text may match.
 */
export type ExchangeListQuery = {
  readonly window: ListWindow
  readonly limit: number
  readonly search: string
  readonly searchBy: ReadonlyArray<ExchangeSearchField>
  readonly orderBy: ExchangeOrderField
  readonly order: "asc" | "desc"
}

/**
 * One page of exchanges with its pagination summary, plus the keyset
 * continuation when the query used a keyset window.
 */
export type ExchangePage = {
  readonly data: ReadonlyArray<ExchangeModel>
  readonly meta: PaginationMeta
  readonly nextCursor?: string | null | undefined
}

/**
 * A page of store rows plus the total row count or the keyset continuation.
 */
export type ExchangeListResult = ListResult<ExchangeModel>

/**
 * Persistence port required by {@link Exchange}.
 *
 * Owned by the application service and implemented by a Drizzle adapter over
 * the `Database` service, so tests can substitute an in-memory database.
 */
export type ExchangeStoreService = {
  /** List exchanges matching the query, using the query's window. */
  readonly list: (query: ExchangeListQuery) => Effect.Effect<ExchangeListResult>
  /** Find an exchange by primary key. */
  readonly findById: (id: ExchangeId) => Effect.Effect<Option.Option<ExchangeModel>>
  /** Find an exchange by CoinMarketCap id. */
  readonly findByCoingeckoId: (coingeckoId: string) => Effect.Effect<Option.Option<ExchangeModel>>
  /** Find an exchange by slug. */
  readonly findBySlug: (slug: string) => Effect.Effect<Option.Option<ExchangeModel>>
  /** Insert an exchange, translating unique violations into conflicts. */
  readonly insert: (
    input: ExchangeCreate
  ) => Effect.Effect<ExchangeModel, ExchangeCoingeckoIdExists | ExchangeSlugExists>
  /** Update an exchange, returning `none` when it no longer exists. */
  readonly update: (
    id: ExchangeId,
    input: ExchangeUpdate
  ) => Effect.Effect<Option.Option<ExchangeModel>, ExchangeCoingeckoIdExists | ExchangeSlugExists>
  /** Delete an exchange, returning the deleted row when it existed. */
  readonly remove: (id: ExchangeId) => Effect.Effect<Option.Option<ExchangeModel>>
}

/**
 * Persistence port required by {@link Exchange}.
 */
export class ExchangeStore extends Context.Service<ExchangeStore, ExchangeStoreService>()(
  "lister/control-plane-api/ExchangeStore"
) {}

/**
 * Application service for exchange CRUD, listing, and pagination.
 *
 * Methods return {@link ExchangeError} carrying the precise failure reason;
 * adapters persist through the narrow {@link ExchangeStore} port.
 */
export class Exchange extends Context.Service<
  Exchange,
  {
    /** List exchanges with search, sort, and pagination. */
    readonly list: (query: ExchangeListQuery) => Effect.Effect<ExchangePage, ExchangeError>
    /** Fetch an exchange by id. */
    readonly getById: (id: ExchangeId) => Effect.Effect<ExchangeModel, ExchangeError>
    /** Create an exchange, rejecting duplicate `coingeckoId` and `slug`. */
    readonly add: (input: ExchangeCreate) => Effect.Effect<ExchangeModel, ExchangeError>
    /** Update an exchange, rejecting duplicate `coingeckoId` and `slug`. */
    readonly update: (id: ExchangeId, input: ExchangeUpdate) => Effect.Effect<ExchangeModel, ExchangeError>
    /** Delete an exchange, failing when it does not exist. */
    readonly remove: (id: ExchangeId) => Effect.Effect<ExchangeModel, ExchangeError>
  }
>()("lister/control-plane-api/Exchange") {
  /**
   * Layer building the service on top of the {@link ExchangeStore} port.
   */
  static readonly layer = Layer.effect(
    Exchange,
    Effect.gen(function*() {
      const store = yield* ExchangeStore

      const notFound = (id: ExchangeId) => new ExchangeError({ reason: new ExchangeNotFound({ id }) })

      const fromStoreError = (reason: ExchangeCoingeckoIdExists | ExchangeSlugExists) => new ExchangeError({ reason })

      const list = Effect.fn("Exchange.list")(function*(
        query: ExchangeListQuery
      ): Effect.fn.Return<ExchangePage, ExchangeError> {
        const result = yield* store.list(query)
        const searchBy = query.searchBy.join(",")

        if (result._tag === "Page") {
          return {
            data: result.rows,
            meta: paginationMeta({
              items: result.total,
              page: result.page,
              limit: query.limit,
              search: query.search,
              searchBy,
              order: query.order,
              orderBy: query.orderBy
            })
          }
        }

        const last = result.rows[result.rows.length - 1]

        return {
          data: result.rows,
          meta: keysetMeta({
            items: result.rows.length,
            limit: query.limit,
            hasMore: result.hasMore,
            search: query.search,
            searchBy,
            order: query.order,
            orderBy: query.orderBy
          }),
          nextCursor: result.hasMore && last !== undefined
            ? encodeCursor({
              orderBy: query.orderBy,
              direction: query.order,
              values: [toCursorValue(last[query.orderBy]), last.id]
            })
            : null
        }
      })

      const getById = Effect.fn("Exchange.getById")(function*(
        id: ExchangeId
      ): Effect.fn.Return<ExchangeModel, ExchangeError> {
        const found = yield* store.findById(id)

        if (Option.isNone(found)) {
          return yield* notFound(id)
        }

        return found.value
      })

      const add = Effect.fn("Exchange.add")(function*(
        input: ExchangeCreate
      ): Effect.fn.Return<ExchangeModel, ExchangeError> {
        const byCoingeckoId = yield* store.findByCoingeckoId(input.coingeckoId)

        if (Option.isSome(byCoingeckoId)) {
          return yield* new ExchangeError({ reason: new ExchangeCoingeckoIdExists({ coingeckoId: input.coingeckoId }) })
        }

        const bySlug = yield* store.findBySlug(input.slug)

        if (Option.isSome(bySlug)) {
          return yield* new ExchangeError({ reason: new ExchangeSlugExists({ slug: input.slug }) })
        }

        return yield* store.insert(input).pipe(Effect.mapError(fromStoreError))
      })

      const update = Effect.fn("Exchange.update")(function*(
        id: ExchangeId,
        input: ExchangeUpdate
      ): Effect.fn.Return<ExchangeModel, ExchangeError> {
        const target = yield* store.findById(id)

        if (Option.isNone(target)) {
          return yield* notFound(id)
        }

        if (input.coingeckoId !== undefined) {
          const byCoingeckoId = yield* store.findByCoingeckoId(input.coingeckoId)

          if (Option.isSome(byCoingeckoId) && byCoingeckoId.value.id !== id) {
            return yield* new ExchangeError({ reason: new ExchangeCoingeckoIdExists({ coingeckoId: input.coingeckoId }) })
          }
        }

        if (input.slug !== undefined) {
          const bySlug = yield* store.findBySlug(input.slug)

          if (Option.isSome(bySlug) && bySlug.value.id !== id) {
            return yield* new ExchangeError({ reason: new ExchangeSlugExists({ slug: input.slug }) })
          }
        }

        const updated = yield* store.update(id, input).pipe(Effect.mapError(fromStoreError))

        if (Option.isNone(updated)) {
          return yield* notFound(id)
        }

        return updated.value
      })

      const remove = Effect.fn("Exchange.remove")(function*(
        id: ExchangeId
      ): Effect.fn.Return<ExchangeModel, ExchangeError> {
        const removed = yield* store.remove(id)

        if (Option.isNone(removed)) {
          return yield* notFound(id)
        }

        return removed.value
      })

      return Exchange.of({ list, getById, add, update, remove })
    })
  )
}
