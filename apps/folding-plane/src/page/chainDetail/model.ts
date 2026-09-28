import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Chain as ChainModel } from '@lister/domain'

import { ChainLinkListResponse, CryptocurrencyPageResponse, MarketListResponse } from '../../api'

// DATA

export const ChainData = AsyncData.Schema(ChainModel.json, Schema.String)

export const LinksData = AsyncData.Schema(ChainLinkListResponse, Schema.String)

export const MarketsData = AsyncData.Schema(MarketListResponse, Schema.String)

export const CoinsData = AsyncData.Schema(CryptocurrencyPageResponse, Schema.String)

// MODEL

export const Model = Schema.Struct({
  chainId: Schema.Int,
  chain: ChainData.schema,
  links: LinksData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
})

export type Model = typeof Model.Type

export type Chain = typeof ChainData.schema.Type
export type Links = typeof LinksData.schema.Type
export type Markets = typeof MarketsData.schema.Type
export type Coins = typeof CoinsData.schema.Type

/**
 * The rows the server resolved before rendering. Each read arrives settled,
 * so a read that failed on the server still renders, with the reason on it
 * and a retry beside it.
 */
export const Seed = Schema.Struct({
  chain: ChainData.schema,
  links: LinksData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
})

export type Seed = typeof Seed.Type

// INIT

export const initFor = (chainId: number): Model => ({
  chainId,
  chain: AsyncData.Idle(),
  links: AsyncData.Idle(),
  markets: AsyncData.Idle(),
  coins: AsyncData.Idle(),
})

// MISSING

/**
 * Whether a read's reason means the chain is gone rather than unreadable.
 * The transport reports the status it answered with, so a 404 names a missing
 * chain where any other reason names a failure with a retry.
 */
export const isMissing = (detail: string): boolean => detail.includes('404')
