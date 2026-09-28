import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'

import {
  ChainPageResponse,
  CryptocurrencyStatsPageResponse,
  ExchangePageResponse,
} from '../../api'
import { CoinsQuery, defaultCoinsQuery } from '../../route'

// FORM

const maxLength = 255

export const symbolRules = FieldValidation.makeRules({
  required: 'A coin symbol is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A coin symbol is at most 255 characters.'),
  ],
})

export const nameRules = FieldValidation.makeRules({
  required: 'A coin name is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A coin name is at most 255 characters.'),
  ],
})

export const slugRules = FieldValidation.makeRules({
  required: 'A coin slug is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A coin slug is at most 255 characters.'),
  ],
})

export const coingeckoIdRules = FieldValidation.makeRules({
  required: 'A CoinGecko id is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A CoinGecko id is at most 255 characters.'),
  ],
})

export const logoRules = FieldValidation.makeRules({
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A logo is at most 255 characters.'),
  ],
})

const Editing = Schema.Struct({ id: Schema.Int })
const Removing = Schema.Struct({ id: Schema.Int, symbol: Schema.String })

// SCOPE

export const ScopeKind = Schema.Literals(['exchange', 'chain'])
export type ScopeKind = typeof ScopeKind.Type

export const ScopeExchanges = AsyncData.Schema(ExchangePageResponse, Schema.String)
export const ScopeChains = AsyncData.Schema(ChainPageResponse, Schema.String)

// MODEL

export const Coins = AsyncData.Schema(CryptocurrencyStatsPageResponse, Schema.String)

export const Model = Schema.Struct({
  query: CoinsQuery,
  loadedQuery: Schema.Option(CoinsQuery),
  coins: Coins.schema,
  scopeDialog: Dialog.Model,
  scopeKind: ScopeKind,
  scopeSearch: Schema.String,
  scopeExchanges: ScopeExchanges.schema,
  scopeChains: ScopeChains.schema,
  editor: Dialog.Model,
  editing: Schema.Option(Editing),
  symbol: FieldValidation.Field(Schema.String),
  name: FieldValidation.Field(Schema.String),
  slug: FieldValidation.Field(Schema.String),
  coingeckoId: FieldValidation.Field(Schema.String),
  logo: FieldValidation.Field(Schema.String),
  notice: Schema.Option(Schema.String),
  isSaving: Schema.Boolean,
  removeDialog: Dialog.Model,
  maybeRemoving: Schema.Option(Removing),
})

export type Model = typeof Model.Type

export type Coins = typeof Coins.schema.Type

// INIT

export const init = (query: CoinsQuery): Model => ({
  query,
  loadedQuery: Option.none(),
  coins: AsyncData.Idle(),
  scopeDialog: Dialog.init({ id: 'coin-scope' }),
  scopeKind: 'exchange',
  scopeSearch: '',
  scopeExchanges: AsyncData.Idle(),
  scopeChains: AsyncData.Idle(),
  editor: Dialog.init({ id: 'coin-editor' }),
  editing: Option.none(),
  symbol: FieldValidation.NotValidated({ value: '' }),
  name: FieldValidation.NotValidated({ value: '' }),
  slug: FieldValidation.NotValidated({ value: '' }),
  coingeckoId: FieldValidation.NotValidated({ value: '' }),
  logo: FieldValidation.NotValidated({ value: '' }),
  notice: Option.none(),
  isSaving: false,
  removeDialog: Dialog.init({ id: 'coin-remove' }),
  maybeRemoving: Option.none(),
})

export const initialModel: Model = init(defaultCoinsQuery)

// FORM

export const isFormValid = (model: Model): boolean =>
  FieldValidation.allValid([
    [model.symbol, symbolRules],
    [model.name, nameRules],
    [model.slug, slugRules],
    [model.coingeckoId, coingeckoIdRules],
    [model.logo, logoRules],
  ])

export const editorTitle = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'New coin',
    onSome: () => `Edit ${model.symbol.value}`,
  })

export const confirmLabel = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'Add coin',
    onSome: () => 'Save coin',
  })

export const removeTitle = (model: Model): string =>
  Option.match(model.maybeRemoving, {
    onNone: () => 'Remove coin',
    onSome: ({ symbol }) => `Remove ${symbol}?`,
  })

export const isEditing = (model: Model): boolean => Option.isSome(model.editing)
