import { CryptocurrencySearchField } from '@lister/api/client'
import { Dialog } from '@foldkit/ui'
import { Schema } from 'effect'
import { Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import {
  ChainPageResponse,
  CryptocurrencyStatsPageResponse,
  ExchangePageResponse,
} from '../../api'
import type { CoverageFlag, CoverageSort } from '../../route'
import { ScopeKind } from './model'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  CompletedSearchCoins: {},
  CompletedInterruptSearchCoins: { outcome: Command.Interruptible.Outcome },
  CompletedNavigateCoins: {},
  ClickedSort: { column: Schema.Literals(['symbol', 'markets', 'chains', 'blocked']) },
  ChangedFlag: { flag: Schema.Literals(['all', 'blocked', 'single']) },
  ChangedPageSize: { value: Schema.Int },
  ToggledSearchField: { field: CryptocurrencySearchField, isChecked: Schema.Boolean },
  ClickedScope: {},
  ChangedScopeKind: { kind: ScopeKind },
  UpdatedScopeSearch: { value: Schema.String },
  SettledFetchScopeExchanges: { result: Schema.Result(ExchangePageResponse, Schema.String) },
  SettledFetchScopeChains: { result: Schema.Result(ChainPageResponse, Schema.String) },
  PickedScopeExchange: { id: Schema.Int, name: Schema.String },
  PickedScopeChain: { id: Schema.Int, code: Schema.String, name: Schema.String },
  ClickedClearScope: {},
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
  GotScopeDialogMessage: { message: Dialog.Message },
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
