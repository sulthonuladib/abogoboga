import { ExchangeOrderField, ExchangeSearchField } from '@lister/api/client'
import { Dialog, RadioGroup } from '@foldkit/ui'
import { Schema } from 'effect'
import { Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'

import { ExchangePageResponse } from '../../api'
import { BaseCurrency } from './model'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  CompletedSearchExchanges: {},
  CompletedInterruptSearchExchanges: { outcome: Command.Interruptible.Outcome },
  CompletedNavigateExchanges: {},
  ClickedSort: { column: ExchangeOrderField },
  ChangedSort: { column: ExchangeOrderField },
  ClickedClearFilters: {},
  ChangedPageSize: { value: Schema.Int },
  ToggledSearchField: { field: ExchangeSearchField, isChecked: Schema.Boolean },
  ClickedRetry: {},
  ClickedNewExchange: {},
  ClickedEditExchange: {
    id: Schema.Int,
    name: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
    logo: Schema.String,
    baseCurrency: BaseCurrency,
    registeredOnCmc: Schema.Boolean,
  },
  UpdatedExchangeName: { value: Schema.String },
  UpdatedExchangeSlug: { value: Schema.String },
  UpdatedExchangeCoingeckoId: { value: Schema.String },
  UpdatedExchangeLogo: { value: Schema.String },
  ChangedBaseCurrency: { value: BaseCurrency },
  ToggledRegisteredOnCmc: { isChecked: Schema.Boolean },
  ClickedSaveExchange: {},
  SucceededSaveExchange: { name: Schema.String },
  FailedSaveExchange: { detail: Schema.String },
  ClickedRemoveExchange: { id: Schema.Int, name: Schema.String },
  ClickedConfirmRemoveExchange: {},
  SucceededRemoveExchange: { name: Schema.String },
  FailedRemoveExchange: { detail: Schema.String },
  SettledFetchExchanges: { result: Schema.Result(ExchangePageResponse, Schema.String) },
  GotOrderMessage: { message: RadioGroup.Message },
  GotEditorMessage: { message: Dialog.Message },
  GotRemoveDialogMessage: { message: Dialog.Message },
})

export type Message = typeof Message.Type

// OUT MESSAGE

/**
 * The listing changed, so the figures in the rail are out of date.
 */
export const OutMessage = defineMessageUnion({
  ChangedCatalogue: {},
})

export type OutMessage = typeof OutMessage.Type
