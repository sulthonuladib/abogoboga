import {
  ChainLinkListResponse,
  ChainPageResponse,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  CryptocurrencyStatResponse,
  CryptocurrencyStatsPageResponse,
  ExchangePageResponse,
  MarketListResponse,
  WorkerStatus,
} from '@lister/api/client'
import {
  ChainId,
  ChainLink as ChainLinkModel,
  Chain as ChainModel,
  CryptocurrencyId,
  Cryptocurrency as CryptocurrencyModel,
  ExchangeId,
  Exchange as ExchangeModel,
  MarketId,
  Market as MarketModel,
} from '@lister/domain'
import { Schema } from 'effect'

import { del, get, patch, post } from './transport'

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

// DOMAIN

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

// READ

export const countCoins = () =>
  post(
    '/api/cryptocurrency/stats',
    { ...countBody, flag: 'all', sortBy: 'symbol' },
    CryptocurrencyStatsPageResponse,
  )

export const countExchanges = () =>
  post(
    '/api/exchange/list',
    { ...countBody, searchBy: ['name'], orderBy: 'id' },
    ExchangePageResponse,
  )

export const countChains = () =>
  post(
    '/api/chain/list',
    { ...countBody, searchBy: ['name'], orderBy: 'id' },
    ChainPageResponse,
  )

export const countMarkets = () =>
  post('/api/exchange-cryptocurrency/count', {}, Schema.Int)

export const listWorkers = () => get('/api/workers', Schema.Array(WorkerStatus))

export const fetchCoinStats = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    flag: 'all' | 'blocked' | 'single'
    sortBy: 'symbol' | 'markets' | 'chains' | 'blocked'
    order: 'asc' | 'desc'
  }>,
) =>
  post('/api/cryptocurrency/stats', input, CryptocurrencyStatsPageResponse)

export const listExchanges = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    sort: 'id' | 'coingeckoId' | 'name' | 'slug' | 'createdAt' | 'updatedAt'
    order: 'asc' | 'desc'
  }>,
) =>
  post(
    '/api/exchange/list',
    { ...input, searchBy: ['name', 'slug'] },
    ExchangePageResponse,
  )

export const searchExchanges = (search: string) =>
  listExchanges({ limit: 20, page: firstPage, search, sort: 'name', order: 'asc' })

export const findExchange = (exchangeId: number) =>
  get(`/api/exchange/${exchangeId}`, ExchangeModel.json)

export const listExchangeMarkets = (exchangeId: number) =>
  post(
    '/api/exchange-cryptocurrency/list',
    { exchangeId: Schema.decodeUnknownSync(ExchangeId)(exchangeId) },
    MarketListResponse,
  )

export const coinIndex = () =>
  post(
    '/api/cryptocurrency/list',
    {
      limit: unlimited,
      search: '',
      searchBy: ['symbol'],
      orderBy: 'coingeckoId',
      order: 'asc',
    },
    CryptocurrencyPageResponse,
  )

export const findCoin = (coinId: number) =>
  get(`/api/cryptocurrency/${coinId}`, CryptocurrencyModel.json)

export const findCoinMetadata = (coinId: number) =>
  post(
    '/api/cryptocurrency/metadata',
    { id: Schema.decodeUnknownSync(CryptocurrencyId)(coinId) },
    CryptocurrencyMetadataResponse,
  )

export const listChains = (
  input: Readonly<{
    limit: number
    page: number
    search: string
    sort: 'id' | 'name' | 'code' | 'createdAt' | 'updatedAt'
    order: 'asc' | 'desc'
  }>,
) =>
  post(
    '/api/chain/list',
    { ...input, searchBy: ['name', 'code'] },
    ChainPageResponse,
  )

export const searchChains = (search: string) =>
  listChains({ limit: 20, page: firstPage, search, sort: 'name', order: 'asc' })

export const findChain = (chainId: number) =>
  get(`/api/chain/${chainId}`, ChainModel.json)

export const listChainLinks = (chainId: number) =>
  post(
    '/api/exchange-cryptocurrency-chain/list',
    { chainId: Schema.decodeUnknownSync(ChainId)(chainId) },
    ChainLinkListResponse,
  )

export const marketIndex = () =>
  post('/api/exchange-cryptocurrency/list', {}, MarketListResponse)

// WRITE

export const addCoin = (input: Readonly<{
  name: string
  symbol: string
  slug: string
  coingeckoId: string
  logo: string
}>) => post('/api/cryptocurrency/add', input, CryptocurrencyModel.json)

export const updateCoin = (
  coinId: number,
  input: Readonly<{ name: string, symbol: string, slug: string, coingeckoId: string }>,
) => patch(`/api/cryptocurrency/${coinId}`, input, CryptocurrencyModel.json)

export const removeCoin = (coinId: number) =>
  del(`/api/cryptocurrency/${coinId}`, CryptocurrencyModel.json)

export const addExchange = (input: Readonly<{
  name: string
  slug: string
  coingeckoId: string
  logo: string
  baseCurrency: 'usdt' | 'idr'
  registeredOnCmc: boolean
}>) => post('/api/exchange/add', input, ExchangeModel.json)

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
) => patch(`/api/exchange/${exchangeId}`, input, ExchangeModel.json)

export const removeExchange = (exchangeId: number) =>
  del(`/api/exchange/${exchangeId}`, ExchangeModel.json)

export const addChain = (input: Readonly<{ name: string, code: string }>) =>
  post('/api/chain/add', input, ChainModel.json)

export const findOrCreateChain = (input: Readonly<{ name: string, code: string }>) =>
  post('/api/chain/find-or-create', input, ChainModel.json)

export const updateChain = (
  chainId: number,
  input: Readonly<{ name: string, code: string }>,
) => patch(`/api/chain/${chainId}`, input, ChainModel.json)

export const removeChain = (chainId: number) =>
  del(`/api/chain/${chainId}`, ChainModel.json)

export const assignMarket = (input: Readonly<{
  exchangeId: number
  cryptocurrencyId: number
  exchangeSymbol: string
  listed: boolean
  tradeEnabled: boolean
}>) =>
  post(
    '/api/exchange-cryptocurrency/assign',
    {
      exchangeId: Schema.decodeUnknownSync(ExchangeId)(input.exchangeId),
      cryptocurrencyId: Schema.decodeUnknownSync(CryptocurrencyId)(
        input.cryptocurrencyId,
      ),
      exchangeSymbol: input.exchangeSymbol,
      listed: input.listed,
      tradeEnabled: input.tradeEnabled,
    },
    MarketModel.json,
  )

export const updateMarket = (
  marketId: number,
  input: Readonly<{
    exchangeSymbol: string
    listed: boolean
    tradeEnabled: boolean
  }>,
) => patch(`/api/exchange-cryptocurrency/${marketId}`, input, MarketModel.json)

export const unassignMarket = (marketId: number) =>
  del(`/api/exchange-cryptocurrency/${marketId}`, MarketModel.json)

export const addChainLink = (input: Readonly<{
  exchangeCryptocurrencyId: number
  chainId: number
  exchangeChainCode: string
  exchangeChainName: string | null
  withdrawEnabled: boolean
  depositEnabled: boolean
}>) =>
  post(
    '/api/exchange-cryptocurrency-chain/add',
    {
      exchangeCryptocurrencyId: Schema.decodeUnknownSync(MarketId)(
        input.exchangeCryptocurrencyId,
      ),
      chainId: Schema.decodeUnknownSync(ChainId)(input.chainId),
      exchangeChainCode: input.exchangeChainCode,
      exchangeChainName: input.exchangeChainName,
      withdrawEnabled: input.withdrawEnabled,
      depositEnabled: input.depositEnabled,
    },
    ChainLinkModel.json,
  )

export const updateChainLink = (
  linkId: number,
  input: Readonly<{
    exchangeChainCode: string
    exchangeChainName: string | null
    withdrawEnabled: boolean
    depositEnabled: boolean
  }>,
) => patch(`/api/exchange-cryptocurrency-chain/${linkId}`, input, ChainLinkModel.json)

export const removeChainLink = (linkId: number) =>
  del(`/api/exchange-cryptocurrency-chain/${linkId}`, ChainLinkModel.json)

export const startWorker = (exchangeId: number) =>
  post(`/api/workers/${exchangeId}/start`, {}, WorkerStatus)

export const stopWorker = (exchangeId: number) =>
  post(`/api/workers/${exchangeId}/stop`, {}, WorkerStatus)
