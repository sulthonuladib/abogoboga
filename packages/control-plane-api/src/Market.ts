import {
  Cryptocurrency as CryptocurrencyModel,
  type CryptocurrencyId,
  Exchange as ExchangeModel,
  type ExchangeId,
  Market as MarketModel,
  type MarketId
} from "@lister/domain"
import { Context, Effect, Layer, Option } from "effect"
import { CryptocurrencyNotFound } from "./CryptocurrencyErrors.ts"
import { ExchangeNotFound } from "./ExchangeErrors.ts"
import { MarketError, MarketExists, MarketNotFound } from "./MarketErrors.ts"

/**
 * Fields accepted when assigning an exchange/coin market.
 */
export type MarketCreate = typeof MarketModel.jsonCreate.Type

/**
 * Fields accepted when updating a market assignment.
 */
export type MarketUpdate = typeof MarketModel.jsonUpdate.Type

/**
 * Filter accepted by {@link Market.list} and {@link Market.count}.
 *
 * Both foreign keys are optional; a query with no filter returns every
 * assignment, matching the legacy list surface.
 */
export type MarketListQuery = {
  readonly exchangeId?: ExchangeId | undefined
  readonly cryptocurrencyId?: CryptocurrencyId | undefined
}

/**
 * Persistence port required by {@link Market}.
 *
 * Owned by the application service and implemented by a Drizzle adapter over
 * the `Database` service, so tests can substitute an in-memory database.
 */
export type MarketStoreService = {
  /** List market assignments matching the filter. */
  readonly list: (query: MarketListQuery) => Effect.Effect<ReadonlyArray<MarketModel>>
  /** Count market assignments matching the filter. */
  readonly count: (query: MarketListQuery) => Effect.Effect<number>
  /** Find a market assignment by primary key. */
  readonly findById: (id: MarketId) => Effect.Effect<Option.Option<MarketModel>>
  /** Find the exchange an assignment references. */
  readonly findExchange: (id: ExchangeId) => Effect.Effect<Option.Option<ExchangeModel>>
  /** Find the cryptocurrency an assignment references. */
  readonly findCryptocurrency: (id: CryptocurrencyId) => Effect.Effect<Option.Option<CryptocurrencyModel>>
  /** Find the assignment for an exchange/coin pair. */
  readonly findByPair: (
    exchangeId: ExchangeId,
    cryptocurrencyId: CryptocurrencyId
  ) => Effect.Effect<Option.Option<MarketModel>>
  /** Insert an assignment, translating unique violations into conflicts. */
  readonly insert: (input: MarketCreate) => Effect.Effect<MarketModel, MarketExists>
  /** Update an assignment, returning `none` when it no longer exists. */
  readonly update: (id: MarketId, input: MarketUpdate) => Effect.Effect<Option.Option<MarketModel>, MarketExists>
  /** Delete an assignment, returning the deleted row when it existed. */
  readonly remove: (id: MarketId) => Effect.Effect<Option.Option<MarketModel>>
}

/**
 * Persistence port required by {@link Market}.
 */
export class MarketStore extends Context.Service<MarketStore, MarketStoreService>()(
  "lister/control-plane-api/MarketStore"
) {}

/**
 * Application service for market-assignment CRUD.
 *
 * Assignments are validated against the exchange and cryptocurrency they
 * reference, so a missing foreign key fails before any row is written.
 */
export class Market extends Context.Service<
  Market,
  {
    /** List assignments, optionally filtered by exchange or coin. */
    readonly list: (query: MarketListQuery) => Effect.Effect<ReadonlyArray<MarketModel>, MarketError>
    /** Count assignments, optionally filtered by exchange or coin. */
    readonly count: (query: MarketListQuery) => Effect.Effect<number, MarketError>
    /** Fetch an assignment by id. */
    readonly getById: (id: MarketId) => Effect.Effect<MarketModel, MarketError>
    /** Assign a coin to an exchange, rejecting an existing pair. */
    readonly assign: (input: MarketCreate) => Effect.Effect<MarketModel, MarketError>
    /** Update an assignment, rejecting a duplicate pair. */
    readonly update: (id: MarketId, input: MarketUpdate) => Effect.Effect<MarketModel, MarketError>
    /** Remove an assignment, failing when it does not exist. */
    readonly unassign: (id: MarketId) => Effect.Effect<MarketModel, MarketError>
  }
>()("lister/control-plane-api/Market") {
  /**
   * Layer building the service on top of the {@link MarketStore} port.
   */
  static readonly layer = Layer.effect(
    Market,
    Effect.gen(function*() {
      const store = yield* MarketStore

      const notFound = (id: MarketId) => new MarketError({ reason: new MarketNotFound({ id }) })

      const fromStoreError = (reason: MarketExists) => new MarketError({ reason })

      const missingExchange = (id: ExchangeId) => new MarketError({ reason: new ExchangeNotFound({ id }) })

      const missingCryptocurrency = (id: CryptocurrencyId) =>
        new MarketError({ reason: new CryptocurrencyNotFound({ lookup: { by: "id", id } }) })

      const list = Effect.fn("Market.list")(function*(query: MarketListQuery) {
        return yield* store.list(query)
      })

      const count = Effect.fn("Market.count")(function*(query: MarketListQuery) {
        return yield* store.count(query)
      })

      const getById = Effect.fn("Market.getById")(function*(
        id: MarketId
      ): Effect.fn.Return<MarketModel, MarketError> {
        const found = yield* store.findById(id)

        if (Option.isNone(found)) {
          return yield* notFound(id)
        }

        return found.value
      })

      const assign = Effect.fn("Market.assign")(function*(
        input: MarketCreate
      ): Effect.fn.Return<MarketModel, MarketError> {
        const exchange = yield* store.findExchange(input.exchangeId)

        if (Option.isNone(exchange)) {
          return yield* missingExchange(input.exchangeId)
        }

        const cryptocurrency = yield* store.findCryptocurrency(input.cryptocurrencyId)

        if (Option.isNone(cryptocurrency)) {
          return yield* missingCryptocurrency(input.cryptocurrencyId)
        }

        const existing = yield* store.findByPair(input.exchangeId, input.cryptocurrencyId)

        if (Option.isSome(existing)) {
          return yield* new MarketError({
            reason: new MarketExists({
              exchangeId: input.exchangeId,
              cryptocurrencyId: input.cryptocurrencyId
            })
          })
        }

        return yield* store.insert(input).pipe(Effect.mapError(fromStoreError))
      })

      const update = Effect.fn("Market.update")(function*(
        id: MarketId,
        input: MarketUpdate
      ): Effect.fn.Return<MarketModel, MarketError> {
        const target = yield* store.findById(id)

        if (Option.isNone(target)) {
          return yield* notFound(id)
        }

        if (input.exchangeId !== undefined) {
          const exchange = yield* store.findExchange(input.exchangeId)

          if (Option.isNone(exchange)) {
            return yield* missingExchange(input.exchangeId)
          }
        }

        if (input.cryptocurrencyId !== undefined) {
          const cryptocurrency = yield* store.findCryptocurrency(input.cryptocurrencyId)

          if (Option.isNone(cryptocurrency)) {
            return yield* missingCryptocurrency(input.cryptocurrencyId)
          }
        }

        const exchangeId = input.exchangeId ?? target.value.exchangeId
        const cryptocurrencyId = input.cryptocurrencyId ?? target.value.cryptocurrencyId

        if (exchangeId !== target.value.exchangeId || cryptocurrencyId !== target.value.cryptocurrencyId) {
          const existing = yield* store.findByPair(exchangeId, cryptocurrencyId)

          if (Option.isSome(existing) && existing.value.id !== id) {
            return yield* new MarketError({
              reason: new MarketExists({ exchangeId, cryptocurrencyId })
            })
          }
        }

        const updated = yield* store.update(id, input).pipe(Effect.mapError(fromStoreError))

        if (Option.isNone(updated)) {
          return yield* notFound(id)
        }

        return updated.value
      })

      const unassign = Effect.fn("Market.unassign")(function*(
        id: MarketId
      ): Effect.fn.Return<MarketModel, MarketError> {
        const removed = yield* store.remove(id)

        if (Option.isNone(removed)) {
          return yield* notFound(id)
        }

        return removed.value
      })

      return Market.of({ list, count, getById, assign, update, unassign })
    })
  )
}
