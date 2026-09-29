import {
  ChainPageResponse,
  type ChainSearchField,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  type CryptocurrencySearchField,
  CryptocurrencyStatResponse,
  CryptocurrencyStatsPageResponse,
  ExchangePageResponse,
  type ExchangeSearchField,
} from '@lister/api/client'
import {
  ChainId,
  ChainLinkId,
  ChainLink as ChainLinkModel,
  Chain as ChainModel,
  CryptocurrencyId,
  ExchangeId,
  Exchange as ExchangeModel,
  MarketId,
  Market as MarketModel,
} from '@lister/domain'
import { Schema } from 'effect'

import { apiRequest } from './transport'

// RESPONSE

/**
 * The response schemas, re-exported so a page wraps the same Schema this
 * module decodes into. A page's `AsyncData` is built from them, so the Model
 * and the request cannot drift apart.
 */
export {
  ChainPageResponse,
  ChainLinkListResponse,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  CryptocurrencyStatResponse,
  CryptocurrencyStatsPageResponse,
  ExchangePageResponse,
  MarketListResponse,
  PaginationMeta,
  WorkerEvent,
  WorkerShardStatus,
  WorkerStatus,
} from '@lister/api/client'

export {
  ClientFrame,
  ServerEvent,
  SignalEvent,
  SignalRow,
  Topic,
  freshnessWindowMs,
} from '@lister/api/client'

// DOMAIN

/**
 * The exchange JSON schema, so a page can hold an exchange directory in its
 * Model and map a row's exchange id to its logo without a second request.
 */
export const ExchangeJson = ExchangeModel.json

export type ChainPage = typeof ChainPageResponse.Type
export type CoinPage = typeof CryptocurrencyPageResponse.Type
export type ExchangePage = typeof ExchangePageResponse.Type
export type CoinStat = typeof CryptocurrencyStatResponse.Type
export type CoinStatPage = typeof CryptocurrencyStatsPageResponse.Type
export type CoinMetadata = typeof CryptocurrencyMetadataResponse.Type
export type MarketAssignment = typeof MarketModel.json.Type
export type Chain = typeof ChainModel.json.Type
export type ChainLink = typeof ChainLinkModel.json.Type
export type Exchange = typeof ExchangeModel.json.Type

/**
 * `limit: -1` asks for every row on one page. The API treats it as unlimited
 * and reports the true total, so a count query and an index read both work
 * without a second endpoint.
 */
export const unlimited = -1

const firstPage = 1

const countBody = {
  limit: 1,
  page: firstPage,
  search: '',
  order: 'asc',
} as const

// Branded primary keys. A route carries plain integers; the API payloads name
// the aggregate each id belongs to, so each is branded once on the way in.

const asChainId = Schema.decodeUnknownSync(ChainId)
const asChainLinkId = Schema.decodeUnknownSync(ChainLinkId)
const asCryptocurrencyId = Schema.decodeUnknownSync(CryptocurrencyId)
const asExchangeId = Schema.decodeUnknownSync(ExchangeId)
const asMarketId = Schema.decodeUnknownSync(MarketId)

// READ

export const countCoins = () =>
  apiRequest('cryptocurrency.stats', (client) =>
    client.cryptocurrency.stats({
      payload: { ...countBody, searchBy: ['symbol', 'name'], flag: 'all', sortBy: 'symbol' },
    }))

export const countExchanges = () =>
  apiRequest('exchange.list', (client) =>
    client.exchange.list({
      payload: { ...countBody, searchBy: ['name'], orderBy: 'id' },
    }))

export const countChains = () =>
  apiRequest('chain.list', (client) =>
    client.chain.list({
      payload: { ...countBody, searchBy: ['name'], orderBy: 'id' },
    }))

export const countMarkets = () =>
  apiRequest('market.count', (client) => client.market.count({ payload: {} }))

export const listWorkers = () =>
  apiRequest('workers.list', (client) => client.workers.list({}))

export const fetchCoinStats = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    searchBy: ReadonlyArray<CryptocurrencySearchField>
    flag: 'all' | 'blocked' | 'single'
    sortBy: 'symbol' | 'markets' | 'chains' | 'blocked'
    order: 'asc' | 'desc'
    exchangeId?: number | undefined
    chainId?: number | undefined
  }>,
) =>
  apiRequest('cryptocurrency.stats', (client) =>
    client.cryptocurrency.stats({
      payload: {
        limit: input.limit,
        page: input.page,
        search: input.search,
        searchBy: input.searchBy,
        flag: input.flag,
        sortBy: input.sortBy,
        order: input.order,
        exchangeId: input.exchangeId === undefined
          ? undefined
          : asExchangeId(input.exchangeId),
        chainId: input.chainId === undefined ? undefined : asChainId(input.chainId),
      },
    }))

export const listExchanges = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    searchBy: ReadonlyArray<ExchangeSearchField>
    sort: 'id' | 'coingeckoId' | 'name' | 'slug' | 'createdAt' | 'updatedAt'
    order: 'asc' | 'desc'
  }>,
) =>
  apiRequest('exchange.list', (client) =>
    client.exchange.list({
      payload: {
        limit: input.limit,
        page: input.page,
        search: input.search,
        order: input.order,
        searchBy: input.searchBy,
        orderBy: input.sort,
      },
    }))

export const searchExchanges = (search: string) =>
  listExchanges({
    limit: 20,
    page: firstPage,
    search,
    searchBy: ['name', 'slug'],
    sort: 'name',
    order: 'asc',
  })

export const findExchange = (exchangeId: number) =>
  apiRequest('exchange.findById', (client) =>
    client.exchange.findById({ params: { id: asExchangeId(exchangeId) } }))

export const listExchangeMarkets = (exchangeId: number) =>
  apiRequest('market.list', (client) =>
    client.market.list({ payload: { exchangeId: asExchangeId(exchangeId) } }))

export const coinIndex = () =>
  apiRequest('cryptocurrency.list', (client) =>
    client.cryptocurrency.list({
      payload: {
        limit: unlimited,
        search: '',
        searchBy: ['symbol'],
        orderBy: 'coingeckoId',
        order: 'asc',
      },
    }))

export const findCoin = (coinId: number) =>
  apiRequest('cryptocurrency.findById', (client) =>
    client.cryptocurrency.findById({ params: { id: asCryptocurrencyId(coinId) } }))

export const findCoinMetadata = (coinId: number) =>
  apiRequest('cryptocurrency.metadata', (client) =>
    client.cryptocurrency.metadata({ payload: { id: asCryptocurrencyId(coinId) } }))

export const listChains = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    searchBy: ReadonlyArray<ChainSearchField>
    sort: 'id' | 'name' | 'code' | 'createdAt' | 'updatedAt'
    order: 'asc' | 'desc'
  }>,
) =>
  apiRequest('chain.list', (client) =>
    client.chain.list({
      payload: {
        limit: input.limit,
        page: input.page,
        search: input.search,
        order: input.order,
        searchBy: input.searchBy,
        orderBy: input.sort,
      },
    }))

export const searchChains = (search: string) =>
  listChains({
    limit: 20,
    page: firstPage,
    search,
    searchBy: ['name', 'code'],
    sort: 'name',
    order: 'asc',
  })

export const findChain = (chainId: number) =>
  apiRequest('chain.findById', (client) =>
    client.chain.findById({ params: { id: asChainId(chainId) } }))

export const listChainLinks = (chainId: number) =>
  apiRequest('chainLink.list', (client) =>
    client.chainLink.list({ payload: { chainId: asChainId(chainId) } }))

export const marketIndex = () =>
  apiRequest('market.list', (client) => client.market.list({ payload: {} }))

// WRITE

export const addCoin = (input: Readonly<{
  name: string
  symbol: string
  slug: string
  coingeckoId: string
  logo: string
}>) =>
  apiRequest('cryptocurrency.add', (client) =>
    client.cryptocurrency.add({ payload: input }))

export const updateCoin = (
  coinId: number,
  input: Readonly<{ name: string, symbol: string, slug: string, coingeckoId: string }>,
) =>
  apiRequest('cryptocurrency.update', (client) =>
    client.cryptocurrency.update({
      params: { id: asCryptocurrencyId(coinId) },
      payload: input,
    }))

export const removeCoin = (coinId: number) =>
  apiRequest('cryptocurrency.remove', (client) =>
    client.cryptocurrency.remove({ params: { id: asCryptocurrencyId(coinId) } }))

export const addExchange = (input: Readonly<{
  name: string
  slug: string
  coingeckoId: string
  logo: string
  baseCurrency: 'usdt' | 'idr'
  registeredOnCmc: boolean
}>) =>
  apiRequest('exchange.add', (client) =>
    client.exchange.add({ payload: input }))

export const updateExchange = (
  exchangeId: number,
  input: Readonly<{
    name: string
    slug: string
    coingeckoId: string
    logo: string
    baseCurrency: 'usdt' | 'idr'
    registeredOnCmc: boolean
  }>,
) =>
  apiRequest('exchange.update', (client) =>
    client.exchange.update({
      params: { id: asExchangeId(exchangeId) },
      payload: input,
    }))

export const removeExchange = (exchangeId: number) =>
  apiRequest('exchange.remove', (client) =>
    client.exchange.remove({ params: { id: asExchangeId(exchangeId) } }))

export const addChain = (input: Readonly<{ name: string, code: string }>) =>
  apiRequest('chain.add', (client) => client.chain.add({ payload: input }))

export const findOrCreateChain = (input: Readonly<{ name: string, code: string }>) =>
  apiRequest('chain.findOrCreate', (client) =>
    client.chain.findOrCreate({ payload: input }))

export const updateChain = (
  chainId: number,
  input: Readonly<{ name: string, code: string }>,
) =>
  apiRequest('chain.update', (client) =>
    client.chain.update({ params: { id: asChainId(chainId) }, payload: input }))

export const removeChain = (chainId: number) =>
  apiRequest('chain.remove', (client) =>
    client.chain.remove({ params: { id: asChainId(chainId) } }))

export const assignMarket = (input: Readonly<{
  exchangeId: number
  cryptocurrencyId: number
  exchangeSymbol: string
  listed: boolean
  tradeEnabled: boolean
}>) =>
  apiRequest('market.assign', (client) =>
    client.market.assign({
      payload: {
        exchangeId: asExchangeId(input.exchangeId),
        cryptocurrencyId: asCryptocurrencyId(input.cryptocurrencyId),
        exchangeSymbol: input.exchangeSymbol,
        listed: input.listed,
        tradeEnabled: input.tradeEnabled,
      },
    }))

export const updateMarket = (
  marketId: number,
  input: Readonly<{
    exchangeId: number
    cryptocurrencyId: number
    exchangeSymbol: string
    listed: boolean
    tradeEnabled: boolean
  }>,
) =>
  apiRequest('market.update', (client) =>
    client.market.update({
      params: { id: asMarketId(marketId) },
      payload: {
        exchangeId: asExchangeId(input.exchangeId),
        cryptocurrencyId: asCryptocurrencyId(input.cryptocurrencyId),
        exchangeSymbol: input.exchangeSymbol,
        listed: input.listed,
        tradeEnabled: input.tradeEnabled,
      },
    }))

export const unassignMarket = (marketId: number) =>
  apiRequest('market.unassign', (client) =>
    client.market.unassign({ params: { id: asMarketId(marketId) } }))

export const addChainLink = (input: Readonly<{
  exchangeCryptocurrencyId: number
  chainId: number
  exchangeChainCode: string
  exchangeChainName: string | null
  withdrawEnabled: boolean
  depositEnabled: boolean
}>) =>
  apiRequest('chainLink.add', (client) =>
    client.chainLink.add({
      payload: {
        exchangeCryptocurrencyId: asMarketId(input.exchangeCryptocurrencyId),
        chainId: asChainId(input.chainId),
        exchangeChainCode: input.exchangeChainCode,
        exchangeChainName: input.exchangeChainName,
        withdrawEnabled: input.withdrawEnabled,
        depositEnabled: input.depositEnabled,
      },
    }))

export const updateChainLink = (
  linkId: number,
  input: Readonly<{
    exchangeCryptocurrencyId: number
    chainId: number
    exchangeChainCode: string
    exchangeChainName: string | null
    withdrawEnabled: boolean
    depositEnabled: boolean
  }>,
) =>
  apiRequest('chainLink.update', (client) =>
    client.chainLink.update({
      params: { id: asChainLinkId(linkId) },
      payload: {
        exchangeCryptocurrencyId: asMarketId(input.exchangeCryptocurrencyId),
        chainId: asChainId(input.chainId),
        exchangeChainCode: input.exchangeChainCode,
        exchangeChainName: input.exchangeChainName,
        withdrawEnabled: input.withdrawEnabled,
        depositEnabled: input.depositEnabled,
      },
    }))

export const removeChainLink = (linkId: number) =>
  apiRequest('chainLink.remove', (client) =>
    client.chainLink.remove({ params: { id: asChainLinkId(linkId) } }))

export const startWorker = (exchangeId: number) =>
  apiRequest('workers.start', (client) =>
    client.workers.start({ params: { exchangeId } }))

export const stopWorker = (exchangeId: number) =>
  apiRequest('workers.stop', (client) =>
    client.workers.stop({ params: { exchangeId } }))
