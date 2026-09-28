import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import { CryptocurrencyStatsPageResponse } from '../../api'
import type { CoverageFlag, CoverageSort } from '../../route'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  CompletedSearchCoins: {},
  CompletedInterruptSearchCoins: { outcome: Command.Interruptible.Outcome },
  CompletedNavigateCoins: {},
  ClickedSort: { column: Schema.Literals(['symbol', 'markets', 'chains', 'blocked']) },
  ChangedFlag: { flag: Schema.Literals(['all', 'blocked', 'single']) },
  ClickedRetry: {},
  ClickedNewCoin: {},
  ClickedEditCoin: {
    id: Schema.Int,
    name: Schema.String,
    symbol: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
    logo: Schema.String,
  },
  UpdatedCoinSymbol: { value: Schema.String },
  UpdatedCoinName: { value: Schema.String },
  UpdatedCoinSlug: { value: Schema.String },
  UpdatedCoinCoingeckoId: { value: Schema.String },
  UpdatedCoinLogo: { value: Schema.String },
  ClickedSaveCoin: {},
  SucceededSaveCoin: { symbol: Schema.String },
  FailedSaveCoin: { detail: Schema.String },
  ClickedRemoveCoin: { id: Schema.Int, symbol: Schema.String },
  ClickedConfirmRemoveCoin: {},
  SucceededRemoveCoin: { symbol: Schema.String },
  FailedRemoveCoin: { detail: Schema.String },
  SettledFetchCoins: { result: Schema.Result(CryptocurrencyStatsPageResponse, Schema.String) },
  GotEditorMessage: { message: Dialog.Message },
  GotRemoveDialogMessage: { message: Dialog.Message },
})

export type Message = typeof Message.Type

export type SortColumn = CoverageSort
export type FlagValue = CoverageFlag

// OUT MESSAGE

/**
 * The listing changed, so the figures in the rail are out of date.
 */
export const OutMessage = defineMessageUnion({
  ChangedCatalogue: {},
})

export type OutMessage = typeof OutMessage.Type
