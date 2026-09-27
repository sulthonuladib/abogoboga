import { Schema } from 'effect'
import { AsyncData } from 'foldkit'

import { CryptocurrencyStatsPageResponse } from '../../api'

// WINDOW

export const attentionRows = 5

// MODEL

export const Blocked = AsyncData.Schema(CryptocurrencyStatsPageResponse, Schema.String)

export const Thin = AsyncData.Schema(CryptocurrencyStatsPageResponse, Schema.String)

export const Model = Schema.Struct({
  blocked: Blocked.schema,
  thin: Thin.schema,
})

export type Model = typeof Model.Type

export type Blocked = typeof Blocked.schema.Type
export type Thin = typeof Thin.schema.Type

/**
 * The rows the server resolved before rendering. Each list arrives settled,
 * so a read that failed on the server still renders, with the reason on it
 * and a retry beside it.
 */
export const Seed = Schema.Struct({
  blocked: Blocked.schema,
  thin: Thin.schema,
})

export type Seed = typeof Seed.Type

// INIT

export const initialModel: Model = {
  blocked: AsyncData.Idle(),
  thin: AsyncData.Idle(),
}
