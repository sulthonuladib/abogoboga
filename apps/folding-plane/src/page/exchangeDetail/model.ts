import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Exchange as ExchangeModel } from '@lister/domain'

import { CryptocurrencyPageResponse, MarketListResponse } from '../../api'

// DATA

export const ExchangeData = AsyncData.Schema(ExchangeModel.json, Schema.String)

export const MarketsData = AsyncData.Schema(MarketListResponse, Schema.String)

export const CoinsData = AsyncData.Schema(CryptocurrencyPageResponse, Schema.String)

// MODEL

export const Model = Schema.Struct({
  exchangeId: Schema.Int,
  exchange: ExchangeData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
})

export type Model = typeof Model.Type

export type Exchange = typeof ExchangeData.schema.Type
export type Markets = typeof MarketsData.schema.Type
export type Coins = typeof CoinsData.schema.Type

/**
 * The rows the server resolved before rendering. Each read arrives settled,
 * so a read that failed on the server still renders, with the reason on it
 * and a retry beside it.
 */
export const Seed = Schema.Struct({
  exchange: ExchangeData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
})

export type Seed = typeof Seed.Type

// INIT

export const initFor = (exchangeId: number): Model => ({
  exchangeId,
  exchange: AsyncData.Idle(),
  markets: AsyncData.Idle(),
  coins: AsyncData.Idle(),
})

// MISSING

/**
 * Whether a read's reason means the exchange is gone rather than unreadable.
 * The transport reports the status it answered with, so a 404 names a missing
 * exchange where any other reason names a failure with a retry.
 */
export const isMissing = (detail: string): boolean => detail.includes('404')

// DESCRIPTION

/**
 * Header description for a loaded exchange, naming its base currency,
 * CoinGecko id, and CoinMarketCap state.
 */
export const identityDescription = (exchange: typeof ExchangeModel.json.Type): string =>
  `Base currency ${exchange.baseCurrency.toUpperCase()}. CoinGecko id ${exchange.coingeckoId}. ` +
  (exchange.registeredOnCmc ? 'Registered on CoinMarketCap.' : 'Not registered on CoinMarketCap.')
