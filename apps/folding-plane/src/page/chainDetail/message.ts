import { Schema } from 'effect'
import { Chain as ChainModel } from '@lister/domain'
import { defineMessageUnion } from 'foldkit/message'

import { ChainLinkListResponse, CryptocurrencyPageResponse, MarketListResponse } from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetry: {},
  SettledFetchChain: { result: Schema.Result(ChainModel.json, Schema.String) },
  SettledFetchLinks: { result: Schema.Result(ChainLinkListResponse, Schema.String) },
  SettledFetchMarkets: { result: Schema.Result(MarketListResponse, Schema.String) },
  SettledFetchCoins: { result: Schema.Result(CryptocurrencyPageResponse, Schema.String) },
})

export type Message = typeof Message.Type
