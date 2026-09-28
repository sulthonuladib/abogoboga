import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { CryptocurrencyStatsPageResponse } from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetryBlocked: {},
  ClickedRetryThin: {},
  SettledFetchBlocked: { result: Schema.Result(CryptocurrencyStatsPageResponse, Schema.String) },
  SettledFetchThin: { result: Schema.Result(CryptocurrencyStatsPageResponse, Schema.String) },
})

export type Message = typeof Message.Type
