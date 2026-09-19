import { Chain as ChainModel, type ChainId } from "@lister/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { ChainCodeExists, ChainError, ChainNotFound } from "./ChainErrors.ts"
import { type PaginationMeta, paginationMeta } from "./Pagination.ts"

/**
 * Fields accepted when creating a chain.
 */
export type ChainCreate = typeof ChainModel.jsonCreate.Type

/**
 * Fields accepted when updating a chain.
 */
export type ChainUpdate = typeof ChainModel.jsonUpdate.Type

/**
 * Chain fields that text search can target.
 */
export const ChainSearchField = Schema.Literals(["name", "code"])

/**
 * Decoded chain search field.
 */
export type ChainSearchField = typeof ChainSearchField.Type

/**
 * Chain fields that list results can be ordered by.
 */
export const ChainOrderField = Schema.Literals(["id", "name", "code", "createdAt", "updatedAt"])

/**
 * Decoded chain order field.
 */
export type ChainOrderField = typeof ChainOrderField.Type

/**
 * Query accepted by {@link Chain.list}.
 */
export type ChainListQuery = {
  readonly page: number
  readonly limit: number
  readonly search: string
  readonly searchBy: ChainSearchField
  readonly orderBy: ChainOrderField
  readonly order: "asc" | "desc"
}

/**
 * One page of chains with its pagination summary.
 */
export type ChainPage = {
  readonly data: ReadonlyArray<ChainModel>
  readonly meta: PaginationMeta
}

/**
 * A page of store rows plus the total row count before pagination.
 */
export type ChainListResult = {
  readonly rows: ReadonlyArray<ChainModel>
  readonly total: number
}

/**
 * Persistence port required by {@link Chain}.
 *
 * Owned by the application service and implemented by a Drizzle adapter over
 * the `Database` service, so tests can substitute an in-memory database.
 */
export type ChainStoreService = {
  /** List chains matching the query, plus the unpaginated total. */
  readonly list: (query: ChainListQuery) => Effect.Effect<ChainListResult>
  /** Find a chain by primary key. */
  readonly findById: (id: ChainId) => Effect.Effect<Option.Option<ChainModel>>
  /** Find a chain by its exchange-independent code. */
  readonly findByCode: (code: string) => Effect.Effect<Option.Option<ChainModel>>
  /** Insert a chain, translating unique violations into conflicts. */
  readonly insert: (input: ChainCreate) => Effect.Effect<ChainModel, ChainCodeExists>
  /** Update a chain, returning `none` when it no longer exists. */
  readonly update: (id: ChainId, input: ChainUpdate) => Effect.Effect<Option.Option<ChainModel>, ChainCodeExists>
  /** Delete a chain, returning the deleted row when it existed. */
  readonly remove: (id: ChainId) => Effect.Effect<Option.Option<ChainModel>>
}

/**
 * Persistence port required by {@link Chain}.
 */
export class ChainStore extends Context.Service<ChainStore, ChainStoreService>()(
  "lister/control-plane-api/ChainStore"
) {}

/**
 * Application service for chain CRUD, listing, and pagination.
 *
 * Methods return {@link ChainError} carrying the precise failure reason;
 * adapters persist through the narrow {@link ChainStore} port.
 */
export class Chain extends Context.Service<
  Chain,
  {
    /** List chains with search, sort, and pagination. */
    readonly list: (query: ChainListQuery) => Effect.Effect<ChainPage, ChainError>
    /** Fetch a chain by id. */
    readonly getById: (id: ChainId) => Effect.Effect<ChainModel, ChainError>
    /** Create a chain, rejecting duplicate `code`. */
    readonly add: (input: ChainCreate) => Effect.Effect<ChainModel, ChainError>
    /** Update a chain, rejecting duplicate `code`. */
    readonly update: (id: ChainId, input: ChainUpdate) => Effect.Effect<ChainModel, ChainError>
    /** Delete a chain, failing when it does not exist. */
    readonly remove: (id: ChainId) => Effect.Effect<ChainModel, ChainError>
  }
>()("lister/control-plane-api/Chain") {
  /**
   * Layer building the service on top of the {@link ChainStore} port.
   */
  static readonly layer = Layer.effect(
    Chain,
    Effect.gen(function*() {
      const store = yield* ChainStore

      const notFound = (id: ChainId) => new ChainError({ reason: new ChainNotFound({ id }) })

      const fromStoreError = (reason: ChainCodeExists) => new ChainError({ reason })

      const list = Effect.fn("Chain.list")(function*(
        query: ChainListQuery
      ): Effect.fn.Return<ChainPage, ChainError> {
        const result = yield* store.list(query)

        return {
          data: result.rows,
          meta: paginationMeta({
            items: result.total,
            page: query.page,
            limit: query.limit,
            search: query.search,
            searchBy: query.searchBy,
            order: query.order,
            orderBy: query.orderBy
          })
        }
      })

      const getById = Effect.fn("Chain.getById")(function*(id: ChainId): Effect.fn.Return<ChainModel, ChainError> {
        const found = yield* store.findById(id)

        if (Option.isNone(found)) {
          return yield* notFound(id)
        }

        return found.value
      })

      const add = Effect.fn("Chain.add")(function*(input: ChainCreate): Effect.fn.Return<ChainModel, ChainError> {
        const byCode = yield* store.findByCode(input.code)

        if (Option.isSome(byCode)) {
          return yield* new ChainError({ reason: new ChainCodeExists({ code: input.code }) })
        }

        return yield* store.insert(input).pipe(Effect.mapError(fromStoreError))
      })

      const update = Effect.fn("Chain.update")(function*(
        id: ChainId,
        input: ChainUpdate
      ): Effect.fn.Return<ChainModel, ChainError> {
        const target = yield* store.findById(id)

        if (Option.isNone(target)) {
          return yield* notFound(id)
        }

        if (input.code !== undefined) {
          const byCode = yield* store.findByCode(input.code)

          if (Option.isSome(byCode) && byCode.value.id !== id) {
            return yield* new ChainError({ reason: new ChainCodeExists({ code: input.code }) })
          }
        }

        const updated = yield* store.update(id, input).pipe(Effect.mapError(fromStoreError))

        if (Option.isNone(updated)) {
          return yield* notFound(id)
        }

        return updated.value
      })

      const remove = Effect.fn("Chain.remove")(function*(id: ChainId): Effect.fn.Return<ChainModel, ChainError> {
        const removed = yield* store.remove(id)

        if (Option.isNone(removed)) {
          return yield* notFound(id)
        }

        return removed.value
      })

      return Chain.of({ list, getById, add, update, remove })
    })
  )
}
