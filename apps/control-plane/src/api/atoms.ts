import type {
  ChainOrderField,
  ChainSearchField,
  CryptocurrencyOrderField,
  CryptocurrencySearchField,
  CryptocurrencyStatsFlag,
  CryptocurrencyStatsSort,
  CursorPosition,
  ExchangeOrderField,
  ExchangeSearchField
} from "@lister/api/client"
import { ChainId, CryptocurrencyId, ExchangeId } from "@lister/domain"
import { Schema } from "effect"
import { ApiClient } from "./client.ts"
import { chainLinksKey, chainsKey, coinsKey, exchangesKey, marketsKey, workersKey } from "./keys.ts"

/**
 * Query atoms for the control-plane API.
 *
 * Every helper fills the request fields the API schemas require (search text,
 * sort, and limit are never left implicit), subscribes the atom to the
 * reactivity keys its data belongs to, and keeps a short idle TTL so repeated
 * navigation reuses fresh results without hammering the server.
 *
 * @module
 */

const exchangeIdValue = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

const chainIdValue = (value: number): ChainId => Schema.decodeSync(ChainId)(value)

const coinIdValue = (value: number): CryptocurrencyId => Schema.decodeSync(CryptocurrencyId)(value)

/** Input for a chain list query. */
export type ChainListInput = {
  readonly limit: number
  readonly search?: string | undefined
  readonly searchBy?: ReadonlyArray<ChainSearchField> | undefined
  readonly orderBy?: ChainOrderField | undefined
  readonly order?: "asc" | "desc" | undefined
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
}

/**
 * Query a page of chains.
 *
 * @param input - Search, sort, and window for the page.
 * @returns The query atom for that exact request.
 */
export const chainListAtom = (input: ChainListInput) =>
  ApiClient.query("chain", "list", {
    payload: {
      limit: input.limit,
      search: input.search ?? "",
      searchBy: input.searchBy ?? ["name"],
      orderBy: input.orderBy ?? "id",
      order: input.order ?? "asc",
      page: input.page,
      cursor: input.cursor
    },
    reactivityKeys: [chainsKey],
    timeToLive: "30 seconds"
  })

/** Input for an exchange list query. */
export type ExchangeListInput = {
  readonly limit: number
  readonly search?: string | undefined
  readonly searchBy?: ReadonlyArray<ExchangeSearchField> | undefined
  readonly orderBy?: ExchangeOrderField | undefined
  readonly order?: "asc" | "desc" | undefined
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
}

/**
 * Query a page of exchanges.
 *
 * @param input - Search, sort, and window for the page.
 * @returns The query atom for that exact request.
 */
export const exchangeListAtom = (input: ExchangeListInput) =>
  ApiClient.query("exchange", "list", {
    payload: {
      limit: input.limit,
      search: input.search ?? "",
      searchBy: input.searchBy ?? ["name"],
      orderBy: input.orderBy ?? "id",
      order: input.order ?? "asc",
      page: input.page,
      cursor: input.cursor
    },
    reactivityKeys: [exchangesKey],
    timeToLive: "30 seconds"
  })

/** Input for a coin list query. */
export type CoinListInput = {
  readonly limit: number
  readonly search?: string | undefined
  readonly searchBy?: ReadonlyArray<CryptocurrencySearchField> | undefined
  readonly orderBy?: CryptocurrencyOrderField | undefined
  readonly order?: "asc" | "desc" | undefined
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
}

/**
 * Query a page of coins.
 *
 * @param input - Search, sort, and window for the page.
 * @returns The query atom for that exact request.
 */
export const coinListAtom = (input: CoinListInput) =>
  ApiClient.query("cryptocurrency", "list", {
    payload: {
      limit: input.limit,
      search: input.search ?? "",
      searchBy: input.searchBy ?? ["symbol"],
      orderBy: input.orderBy ?? "coingeckoId",
      order: input.order ?? "asc",
      page: input.page,
      cursor: input.cursor,
      exchangeId: undefined,
      chainId: undefined
    },
    reactivityKeys: [coinsKey, marketsKey, chainLinksKey],
    timeToLive: "30 seconds"
  })

/** Input for a coin listing-stats query. */
export type CoinStatsInput = {
  readonly limit: number
  readonly search?: string | undefined
  readonly flag?: CryptocurrencyStatsFlag | undefined
  readonly sortBy?: CryptocurrencyStatsSort | undefined
  readonly order?: "asc" | "desc" | undefined
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
  readonly exchangeId?: number | undefined
  readonly chainId?: number | undefined
}

/**
 * Query a page of coin listing stats.
 *
 * @param input - Filters, sort, and window for the page.
 * @returns The query atom for that exact request.
 */
export const coinStatsAtom = (input: CoinStatsInput) =>
  ApiClient.query("cryptocurrency", "stats", {
    payload: {
      limit: input.limit,
      search: input.search ?? "",
      flag: input.flag ?? "all",
      sortBy: input.sortBy ?? "symbol",
      order: input.order ?? "asc",
      page: input.page,
      cursor: input.cursor,
      exchangeId: input.exchangeId === undefined ? undefined : exchangeIdValue(input.exchangeId),
      chainId: input.chainId === undefined ? undefined : chainIdValue(input.chainId)
    },
    reactivityKeys: [coinsKey, marketsKey, chainLinksKey],
    timeToLive: "30 seconds"
  })

/**
 * Query one coin by id.
 *
 * @param id - Coin id.
 * @returns The query atom.
 */
export const coinAtom = (id: number) =>
  ApiClient.query("cryptocurrency", "findById", {
    params: { id: coinIdValue(id) },
    reactivityKeys: [coinsKey],
    timeToLive: "30 seconds"
  })

/**
 * Query one coin with every exchange and chain route that lists it.
 *
 * @param id - Coin id.
 * @returns The query atom.
 */
export const coinMetadataAtom = (id: number) =>
  ApiClient.query("cryptocurrency", "metadata", {
    payload: { id: coinIdValue(id) },
    reactivityKeys: [coinsKey, marketsKey, chainLinksKey],
    timeToLive: "15 seconds"
  })

/**
 * Query one exchange by id.
 *
 * @param id - Exchange id.
 * @returns The query atom.
 */
export const exchangeAtom = (id: number) =>
  ApiClient.query("exchange", "findById", {
    params: { id: exchangeIdValue(id) },
    reactivityKeys: [exchangesKey],
    timeToLive: "30 seconds"
  })

/**
 * Query one chain by id.
 *
 * @param id - Chain id.
 * @returns The query atom.
 */
export const chainAtom = (id: number) =>
  ApiClient.query("chain", "findById", {
    params: { id: chainIdValue(id) },
    reactivityKeys: [chainsKey],
    timeToLive: "30 seconds"
  })

/**
 * Query every market assignment of one exchange.
 *
 * @param exchangeId - Exchange id.
 * @returns The query atom.
 */
export const exchangeMarketsAtom = (exchangeId: number) =>
  ApiClient.query("market", "list", {
    payload: { exchangeId: exchangeIdValue(exchangeId), cryptocurrencyId: undefined },
    reactivityKeys: [marketsKey],
    timeToLive: "15 seconds"
  })

/**
 * Query every chain link of one chain.
 *
 * @param chainId - Chain id.
 * @returns The query atom.
 */
export const chainLinksAtom = (chainId: number) =>
  ApiClient.query("chainLink", "list", {
    payload: { chainId: chainIdValue(chainId), exchangeCryptocurrencyId: undefined },
    reactivityKeys: [chainLinksKey, marketsKey],
    timeToLive: "15 seconds"
  })

/**
 * Query the coin index used to resolve market rows to coin names.
 *
 * Detail pages resolve many markets at once, so one shared index is cheaper
 * than one request per row.
 *
 * @returns The query atom.
 */
export const coinIndexAtom = () =>
  ApiClient.query("cryptocurrency", "list", {
    payload: {
      limit: -1,
      search: "",
      searchBy: ["symbol"],
      orderBy: "coingeckoId",
      order: "asc",
      exchangeId: undefined,
      chainId: undefined
    },
    reactivityKeys: [coinsKey],
    timeToLive: "5 minutes"
  })

/**
 * Query every market assignment, used to resolve chain links to coins.
 *
 * @returns The query atom.
 */
export const marketIndexAtom = () =>
  ApiClient.query("market", "list", {
    payload: { exchangeId: undefined, cryptocurrencyId: undefined },
    reactivityKeys: [marketsKey],
    timeToLive: "5 minutes"
  })

/**
 * Query the status of every crawler worker.
 *
 * @returns The query atom.
 */
export const workersAtom = () =>
  ApiClient.query("workers", "list", {
    reactivityKeys: [workersKey],
    timeToLive: "10 seconds"
  })

/**
 * Index rows by id for detail-page lookups.
 *
 * @template Row - Row type carrying an id.
 * @param rows - Rows to index.
 * @returns A map from id to row.
 */
export const rowsById = <Row extends { readonly id: number }>(rows: ReadonlyArray<Row>): Map<number, Row> => {
  const index = new Map<number, Row>()

  for (const row of rows) {
    index.set(row.id, row)
  }

  return index
}
