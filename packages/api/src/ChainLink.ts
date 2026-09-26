import {
  Chain as ChainModel,
  type ChainId,
  ChainLink as ChainLinkModel,
  type ChainLinkId,
  Market as MarketModel,
  type MarketId
} from "@lister/domain"
import { Context, Effect, Layer, Option } from "effect"
import { ChainNotFound } from "./ChainErrors.ts"
import { ChainLinkError, ChainLinkExists, ChainLinkNotFound } from "./ChainLinkErrors.ts"
import { MarketNotFound } from "./MarketErrors.ts"

/**
 * Fields accepted when creating a chain link.
 */
export type ChainLinkCreate = typeof ChainLinkModel.jsonCreate.Type

/**
 * Fields accepted when updating a chain link.
 */
export type ChainLinkUpdate = typeof ChainLinkModel.jsonUpdate.Type

/**
 * Filter accepted by {@link ChainLink.list}.
 *
 * Both foreign keys are optional; a query with no filter returns every link,
 * matching the legacy list surface.
 */
export type ChainLinkListQuery = {
  readonly exchangeCryptocurrencyId?: MarketId | undefined
  readonly chainId?: ChainId | undefined
}

/**
 * Persistence port required by {@link ChainLink}.
 *
 * Owned by the application service and implemented by a Drizzle adapter over
 * the `Database` service, so tests can substitute an in-memory database.
 */
export type ChainLinkStoreService = {
  /** List chain links matching the filter. */
  readonly list: (query: ChainLinkListQuery) => Effect.Effect<ReadonlyArray<ChainLinkModel>>
  /** Find a chain link by primary key. */
  readonly findById: (id: ChainLinkId) => Effect.Effect<Option.Option<ChainLinkModel>>
  /** Find the market assignment a link references. */
  readonly findMarket: (id: MarketId) => Effect.Effect<Option.Option<MarketModel>>
  /** Find the chain a link references. */
  readonly findChain: (id: ChainId) => Effect.Effect<Option.Option<ChainModel>>
  /** Find the link for a market/chain pair. */
  readonly findByPair: (marketId: MarketId, chainId: ChainId) => Effect.Effect<Option.Option<ChainLinkModel>>
  /** Insert a link, translating unique violations into conflicts. */
  readonly insert: (input: ChainLinkCreate) => Effect.Effect<ChainLinkModel, ChainLinkExists>
  /** Update a link, returning `none` when it no longer exists. */
  readonly update: (
    id: ChainLinkId,
    input: ChainLinkUpdate
  ) => Effect.Effect<Option.Option<ChainLinkModel>, ChainLinkExists>
  /** Delete a link, returning the deleted row when it existed. */
  readonly remove: (id: ChainLinkId) => Effect.Effect<Option.Option<ChainLinkModel>>
}

/**
 * Persistence port required by {@link ChainLink}.
 */
export class ChainLinkStore extends Context.Service<ChainLinkStore, ChainLinkStoreService>()(
  "lister/control-plane-api/ChainLinkStore"
) {}

/**
 * Application service for chain-link CRUD.
 *
 * Links are validated against the market assignment and chain they reference,
 * so a missing foreign key fails before any row is written.
 */
export class ChainLink extends Context.Service<
  ChainLink,
  {
    /** List links, optionally filtered by market or chain. */
    readonly list: (query: ChainLinkListQuery) => Effect.Effect<ReadonlyArray<ChainLinkModel>, ChainLinkError>
    /** Fetch a link by id. */
    readonly getById: (id: ChainLinkId) => Effect.Effect<ChainLinkModel, ChainLinkError>
    /** Create a link, rejecting a duplicate market/chain pair. */
    readonly add: (input: ChainLinkCreate) => Effect.Effect<ChainLinkModel, ChainLinkError>
    /** Update a link, rejecting a duplicate market/chain pair. */
    readonly update: (id: ChainLinkId, input: ChainLinkUpdate) => Effect.Effect<ChainLinkModel, ChainLinkError>
    /** Delete a link, failing when it does not exist. */
    readonly remove: (id: ChainLinkId) => Effect.Effect<ChainLinkModel, ChainLinkError>
  }
>()("lister/control-plane-api/ChainLink") {
  /**
   * Layer building the service on top of the {@link ChainLinkStore} port.
   */
  static readonly layer = Layer.effect(
    ChainLink,
    Effect.gen(function*() {
      const store = yield* ChainLinkStore

      const notFound = (id: ChainLinkId) => new ChainLinkError({ reason: new ChainLinkNotFound({ id }) })

      const fromStoreError = (reason: ChainLinkExists) => new ChainLinkError({ reason })

      const missingMarket = (id: MarketId) => new ChainLinkError({ reason: new MarketNotFound({ id }) })

      const missingChain = (id: ChainId) => new ChainLinkError({ reason: new ChainNotFound({ id }) })

      const list = Effect.fn("ChainLink.list")(function*(query: ChainLinkListQuery) {
        return yield* store.list(query)
      })

      const getById = Effect.fn("ChainLink.getById")(function*(
        id: ChainLinkId
      ): Effect.fn.Return<ChainLinkModel, ChainLinkError> {
        const found = yield* store.findById(id)

        if (Option.isNone(found)) {
          return yield* notFound(id)
        }

        return found.value
      })

      const add = Effect.fn("ChainLink.add")(function*(
        input: ChainLinkCreate
      ): Effect.fn.Return<ChainLinkModel, ChainLinkError> {
        const market = yield* store.findMarket(input.exchangeCryptocurrencyId)

        if (Option.isNone(market)) {
          return yield* missingMarket(input.exchangeCryptocurrencyId)
        }

        const chain = yield* store.findChain(input.chainId)

        if (Option.isNone(chain)) {
          return yield* missingChain(input.chainId)
        }

        const existing = yield* store.findByPair(input.exchangeCryptocurrencyId, input.chainId)

        if (Option.isSome(existing)) {
          return yield* new ChainLinkError({
            reason: new ChainLinkExists({
              exchangeCryptocurrencyId: input.exchangeCryptocurrencyId,
              chainId: input.chainId
            })
          })
        }

        return yield* store.insert(input).pipe(Effect.mapError(fromStoreError))
      })

      const update = Effect.fn("ChainLink.update")(function*(
        id: ChainLinkId,
        input: ChainLinkUpdate
      ): Effect.fn.Return<ChainLinkModel, ChainLinkError> {
        const target = yield* store.findById(id)

        if (Option.isNone(target)) {
          return yield* notFound(id)
        }

        if (input.exchangeCryptocurrencyId !== undefined) {
          const market = yield* store.findMarket(input.exchangeCryptocurrencyId)

          if (Option.isNone(market)) {
            return yield* missingMarket(input.exchangeCryptocurrencyId)
          }
        }

        if (input.chainId !== undefined) {
          const chain = yield* store.findChain(input.chainId)

          if (Option.isNone(chain)) {
            return yield* missingChain(input.chainId)
          }
        }

        const marketId = input.exchangeCryptocurrencyId ?? target.value.exchangeCryptocurrencyId
        const chainId = input.chainId ?? target.value.chainId

        if (marketId !== target.value.exchangeCryptocurrencyId || chainId !== target.value.chainId) {
          const existing = yield* store.findByPair(marketId, chainId)

          if (Option.isSome(existing) && existing.value.id !== id) {
            return yield* new ChainLinkError({
              reason: new ChainLinkExists({ exchangeCryptocurrencyId: marketId, chainId })
            })
          }
        }

        const updated = yield* store.update(id, input).pipe(Effect.mapError(fromStoreError))

        if (Option.isNone(updated)) {
          return yield* notFound(id)
        }

        return updated.value
      })

      const remove = Effect.fn("ChainLink.remove")(function*(
        id: ChainLinkId
      ): Effect.fn.Return<ChainLinkModel, ChainLinkError> {
        const removed = yield* store.remove(id)

        if (Option.isNone(removed)) {
          return yield* notFound(id)
        }

        return removed.value
      })

      return ChainLink.of({ list, getById, add, update, remove })
    })
  )
}
