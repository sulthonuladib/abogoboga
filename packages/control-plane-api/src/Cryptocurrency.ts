import {
  type ChainId,
  type ChainLinkId,
  Cryptocurrency as CryptocurrencyModel,
  type CryptocurrencyId,
  type ExchangeId,
  type MarketId,
  type Market,
  type ChainLink
} from "@lister/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import {
  CryptocurrencyCmcIdExists,
  CryptocurrencyError,
  CryptocurrencyNotFound,
  CryptocurrencySlugExists,
  type CryptocurrencyLookup
} from "./CryptocurrencyErrors.ts"
import { buildListingStats } from "./CryptocurrencyListingStats.ts"
import { type PaginationMeta, paginationMeta } from "./Pagination.ts"

/**
 * Fields accepted when creating a cryptocurrency.
 */
export type CryptocurrencyCreate = typeof CryptocurrencyModel.jsonCreate.Type

/**
 * Fields accepted when updating a cryptocurrency.
 *
 * `logo` is owned by the transfer flow, matching the legacy update surface.
 */
export type CryptocurrencyUpdate = Omit<typeof CryptocurrencyModel.jsonUpdate.Type, "logo">

/**
 * Cryptocurrency fields that text search can target.
 */
export const CryptocurrencySearchField = Schema.Literals(["id", "name", "symbol", "slug", "cmcId"])

/**
 * Decoded cryptocurrency search field.
 */
export type CryptocurrencySearchField = typeof CryptocurrencySearchField.Type

/**
 * Cryptocurrency fields that list results can be ordered by.
 */
export const CryptocurrencyOrderField = Schema.Literals([
  "id",
  "name",
  "symbol",
  "slug",
  "cmcId",
  "createdAt",
  "updatedAt"
])

/**
 * Decoded cryptocurrency order field.
 */
export type CryptocurrencyOrderField = typeof CryptocurrencyOrderField.Type

/**
 * Query accepted by {@link CryptocurrencyService.list}.
 */
export type CryptocurrencyListQuery = {
  readonly page: number
  readonly limit: number
  readonly search: string
  readonly searchBy: CryptocurrencySearchField
  readonly orderBy: CryptocurrencyOrderField
  readonly order: "asc" | "desc"
  readonly exchangeId?: ExchangeId | undefined
  readonly chainId?: ChainId | undefined
}

/**
 * One page of cryptocurrencies with its pagination summary.
 */
export type CryptocurrencyPage = {
  readonly data: ReadonlyArray<CryptocurrencyModel>
  readonly meta: PaginationMeta
}

/**
 * Coverage filter accepted by {@link CryptocurrencyService.stats}.
 */
export type CryptocurrencyStatsFlag = "all" | "blocked" | "single"

/**
 * Sort fields accepted by {@link CryptocurrencyService.stats}.
 */
export type CryptocurrencyStatsSort = "symbol" | "markets" | "chains" | "blocked"

/**
 * Query accepted by {@link CryptocurrencyService.stats}.
 */
export type CryptocurrencyStatsQuery = {
  readonly page: number
  readonly limit: number
  readonly search: string
  readonly flag: CryptocurrencyStatsFlag
  readonly sortBy: CryptocurrencyStatsSort
  readonly order: "asc" | "desc"
  readonly exchangeId?: ExchangeId | undefined
  readonly chainId?: ChainId | undefined
}

/**
 * A cryptocurrency plus its listing coverage counts.
 */
export type CryptocurrencyStat = CryptocurrencyModel & {
  readonly markets: number
  readonly chains: number
  readonly blocked: number
}

/**
 * One page of listing-stats rows with its pagination summary.
 */
export type CryptocurrencyStatsPage = {
  readonly data: ReadonlyArray<CryptocurrencyStat>
  readonly meta: PaginationMeta
}

/**
 * A chain on which a market assignment can move value.
 */
export type CryptocurrencyChainListing = {
  readonly id: ChainId
  readonly name: string
  readonly code: string
  readonly linkId: ChainLinkId
  readonly exchangeChainCode: string
  readonly exchangeChainName: string | null
  readonly withdrawEnabled: boolean
  readonly depositEnabled: boolean
}

/**
 * An exchange listing a cryptocurrency, with its chain routes.
 */
export type CryptocurrencyMarketListing = {
  readonly id: ExchangeId
  readonly name: string
  readonly slug: string
  readonly symbol: string
  readonly marketId: MarketId
  readonly listed: boolean
  readonly tradeEnabled: boolean
  readonly chains: ReadonlyArray<CryptocurrencyChainListing>
}

/**
 * A cryptocurrency with every exchange that lists it.
 */
export type CryptocurrencyMetadata = CryptocurrencyModel & {
  readonly exchanges: ReadonlyArray<CryptocurrencyMarketListing>
}

/**
 * A joined exchange/market/chain row as returned by {@link CryptocurrencyStore}.
 */
export type CryptocurrencyExchangeListing = {
  readonly exchangeId: ExchangeId
  readonly exchangeName: string
  readonly exchangeSlug: string
  readonly exchangeSymbol: string
  readonly marketId: MarketId
  readonly listed: boolean
  readonly tradeEnabled: boolean
  readonly chain: Option.Option<CryptocurrencyChainListing>
}

/**
 * A page of store rows plus the total row count before pagination.
 */
export type CryptocurrencyListResult = {
  readonly rows: ReadonlyArray<CryptocurrencyModel>
  readonly total: number
}

/**
 * Persistence port required by {@link Cryptocurrency}.
 *
 * Owned by the application service and implemented by a Drizzle adapter over
 * the `Database` service, so tests can substitute an in-memory database.
 */
export type CryptocurrencyStoreService = {
  /** List cryptocurrencies matching the query, plus the unpaginated total. */
  readonly list: (query: CryptocurrencyListQuery) => Effect.Effect<CryptocurrencyListResult>
  /** Find a cryptocurrency by primary key. */
  readonly findById: (id: CryptocurrencyId) => Effect.Effect<Option.Option<CryptocurrencyModel>>
  /** Find a cryptocurrency by CoinMarketCap id. */
  readonly findByCmcId: (cmcId: number) => Effect.Effect<Option.Option<CryptocurrencyModel>>
  /** Find a cryptocurrency by slug. */
  readonly findBySlug: (slug: string) => Effect.Effect<Option.Option<CryptocurrencyModel>>
  /** Insert a cryptocurrency, translating unique violations into conflicts. */
  readonly insert: (
    input: CryptocurrencyCreate
  ) => Effect.Effect<CryptocurrencyModel, CryptocurrencyCmcIdExists | CryptocurrencySlugExists>
  /** Update a cryptocurrency, returning `none` when it no longer exists. */
  readonly update: (
    id: CryptocurrencyId,
    input: CryptocurrencyUpdate
  ) => Effect.Effect<Option.Option<CryptocurrencyModel>, CryptocurrencyCmcIdExists | CryptocurrencySlugExists>
  /** Delete a cryptocurrency, returning the deleted row when it existed. */
  readonly remove: (id: CryptocurrencyId) => Effect.Effect<Option.Option<CryptocurrencyModel>>
  /** Coins whose symbol or name match the search text. */
  readonly searchCoins: (search: string) => Effect.Effect<ReadonlyArray<CryptocurrencyModel>>
  /** Every market assignment, used to compute listing coverage. */
  readonly listAllMarkets: Effect.Effect<ReadonlyArray<Market>>
  /** Every chain link, used to compute transfer coverage. */
  readonly listAllChainLinks: Effect.Effect<ReadonlyArray<ChainLink>>
  /** Joined exchange/market/chain rows for one cryptocurrency. */
  readonly listListings: (id: CryptocurrencyId) => Effect.Effect<ReadonlyArray<CryptocurrencyExchangeListing>>
}

/**
 * Persistence port required by {@link Cryptocurrency}.
 */
export class CryptocurrencyStore extends Context.Service<CryptocurrencyStore, CryptocurrencyStoreService>()(
  "lister/control-plane-api/CryptocurrencyStore"
) {}

/**
 * Application service for cryptocurrency CRUD, listing, stats, and metadata.
 *
 * Methods return {@link CryptocurrencyError} carrying the precise failure
 * reason; adapters persist through the narrow {@link CryptocurrencyStore} port.
 */
export class Cryptocurrency extends Context.Service<
  Cryptocurrency,
  {
    /** List cryptocurrencies with extended filters and pagination. */
    readonly list: (query: CryptocurrencyListQuery) => Effect.Effect<CryptocurrencyPage, CryptocurrencyError>
    /** List coins with coverage counts, filters, and sorting. */
    readonly stats: (query: CryptocurrencyStatsQuery) => Effect.Effect<CryptocurrencyStatsPage, CryptocurrencyError>
    /** Fetch a cryptocurrency with every exchange listing it. */
    readonly metadata: (lookup: CryptocurrencyLookup) => Effect.Effect<CryptocurrencyMetadata, CryptocurrencyError>
    /** Fetch a cryptocurrency by id. */
    readonly getById: (id: CryptocurrencyId) => Effect.Effect<CryptocurrencyModel, CryptocurrencyError>
    /** Create a cryptocurrency, rejecting duplicate `cmcId` and `slug`. */
    readonly add: (input: CryptocurrencyCreate) => Effect.Effect<CryptocurrencyModel, CryptocurrencyError>
    /** Update a cryptocurrency, rejecting duplicate `cmcId` and `slug`. */
    readonly update: (
      id: CryptocurrencyId,
      input: CryptocurrencyUpdate
    ) => Effect.Effect<CryptocurrencyModel, CryptocurrencyError>
    /** Delete a cryptocurrency, failing when it does not exist. */
    readonly remove: (id: CryptocurrencyId) => Effect.Effect<CryptocurrencyModel, CryptocurrencyError>
  }
>()("lister/control-plane-api/Cryptocurrency") {
  /**
   * Layer building the service on top of the {@link CryptocurrencyStore} port.
   */
  static readonly layer = Layer.effect(
    Cryptocurrency,
    Effect.gen(function*() {
      const store = yield* CryptocurrencyStore

      const lookupById = (id: CryptocurrencyId): CryptocurrencyLookup => ({ by: "id", id })

      const notFound = (lookup: CryptocurrencyLookup) =>
        new CryptocurrencyError({ reason: new CryptocurrencyNotFound({ lookup }) })

      const fromStoreError = (reason: CryptocurrencyCmcIdExists | CryptocurrencySlugExists) =>
        new CryptocurrencyError({ reason })

      const list = Effect.fn("Cryptocurrency.list")(function*(
        query: CryptocurrencyListQuery
      ): Effect.fn.Return<CryptocurrencyPage, CryptocurrencyError> {
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

      const stats = Effect.fn("Cryptocurrency.stats")(function*(
        query: CryptocurrencyStatsQuery
      ): Effect.fn.Return<CryptocurrencyStatsPage, CryptocurrencyError> {
        const coins = yield* store.searchCoins(query.search)
        const markets = yield* store.listAllMarkets
        const links = yield* store.listAllChainLinks

        return buildListingStats({ coins, markets, links }, query)
      })

      const metadata = Effect.fn("Cryptocurrency.metadata")(function*(
        lookup: CryptocurrencyLookup
      ): Effect.fn.Return<CryptocurrencyMetadata, CryptocurrencyError> {
        const found =
          lookup.by === "id" ? yield* store.findById(lookup.id) : yield* store.findBySlug(lookup.slug)

        if (Option.isNone(found)) {
          return yield* notFound(lookup)
        }

        const listings = yield* store.listListings(found.value.id)

        const exchanges = new Map<
          ExchangeId,
          Omit<CryptocurrencyMarketListing, "chains"> & { chains: Array<CryptocurrencyChainListing> }
        >()

        for (const listing of listings) {
          const existing = exchanges.get(listing.exchangeId) ?? {
            id: listing.exchangeId,
            name: listing.exchangeName,
            slug: listing.exchangeSlug,
            symbol: listing.exchangeSymbol,
            marketId: listing.marketId,
            listed: listing.listed,
            tradeEnabled: listing.tradeEnabled,
            chains: []
          }

          if (Option.isSome(listing.chain)) {
            existing.chains.push(listing.chain.value)
          }

          exchanges.set(listing.exchangeId, existing)
        }

        return Object.assign({}, found.value, { exchanges: [...exchanges.values()] })
      })

      const getById = Effect.fn("Cryptocurrency.getById")(function*(
        id: CryptocurrencyId
      ): Effect.fn.Return<CryptocurrencyModel, CryptocurrencyError> {
        const found = yield* store.findById(id)

        if (Option.isNone(found)) {
          return yield* notFound(lookupById(id))
        }

        return found.value
      })

      const add = Effect.fn("Cryptocurrency.add")(function*(
        input: CryptocurrencyCreate
      ): Effect.fn.Return<CryptocurrencyModel, CryptocurrencyError> {
        const byCmcId = yield* store.findByCmcId(input.cmcId)

        if (Option.isSome(byCmcId)) {
          return yield* new CryptocurrencyError({ reason: new CryptocurrencyCmcIdExists({ cmcId: input.cmcId }) })
        }

        const bySlug = yield* store.findBySlug(input.slug)

        if (Option.isSome(bySlug)) {
          return yield* new CryptocurrencyError({ reason: new CryptocurrencySlugExists({ slug: input.slug }) })
        }

        return yield* store.insert(input).pipe(Effect.mapError(fromStoreError))
      })

      const update = Effect.fn("Cryptocurrency.update")(function*(
        id: CryptocurrencyId,
        input: CryptocurrencyUpdate
      ): Effect.fn.Return<CryptocurrencyModel, CryptocurrencyError> {
        const target = yield* store.findById(id)

        if (Option.isNone(target)) {
          return yield* notFound(lookupById(id))
        }

        if (input.cmcId !== undefined) {
          const byCmcId = yield* store.findByCmcId(input.cmcId)

          if (Option.isSome(byCmcId) && byCmcId.value.id !== id) {
            return yield* new CryptocurrencyError({ reason: new CryptocurrencyCmcIdExists({ cmcId: input.cmcId }) })
          }
        }

        if (input.slug !== undefined) {
          const bySlug = yield* store.findBySlug(input.slug)

          if (Option.isSome(bySlug) && bySlug.value.id !== id) {
            return yield* new CryptocurrencyError({ reason: new CryptocurrencySlugExists({ slug: input.slug }) })
          }
        }

        const updated = yield* store.update(id, input).pipe(Effect.mapError(fromStoreError))

        if (Option.isNone(updated)) {
          return yield* notFound(lookupById(id))
        }

        return updated.value
      })

      const remove = Effect.fn("Cryptocurrency.remove")(function*(
        id: CryptocurrencyId
      ): Effect.fn.Return<CryptocurrencyModel, CryptocurrencyError> {
        const removed = yield* store.remove(id)

        if (Option.isNone(removed)) {
          return yield* notFound(lookupById(id))
        }

        return removed.value
      })

      return Cryptocurrency.of({ list, stats, metadata, getById, add, update, remove })
    })
  )
}
