import { Schema } from 'effect'
import { Exchange as ExchangeModel } from '@lister/domain'
import { defineMessageUnion } from 'foldkit/message'

import { CryptocurrencyPageResponse, MarketListResponse } from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetry: {},
  SettledFetchExchange: { result: Schema.Result(ExchangeModel.json, Schema.String) },
  SettledFetchMarkets: { result: Schema.Result(MarketListResponse, Schema.String) },
  SettledFetchCoins: { result: Schema.Result(CryptocurrencyPageResponse, Schema.String) },
})

export type Message = typeof Message.Type
