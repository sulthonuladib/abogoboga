import { Dialog, RadioGroup } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'

import { ExchangePageResponse } from '../../api'
import { ExchangesQuery, type Order, defaultExchangesQuery } from '../../route'

// FORM

const maxLength = 255

export const nameRules = FieldValidation.makeRules({
  required: 'An exchange name is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'An exchange name is at most 255 characters.'),
  ],
})

export const slugRules = FieldValidation.makeRules({
  required: 'An exchange slug is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'An exchange slug is at most 255 characters.'),
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

export const BaseCurrency = Schema.Literals(['usdt', 'idr'])
export type BaseCurrency = typeof BaseCurrency.Type

/**
 * The sort-direction pills in the filter panel, bound to the query's order
 * union so a selection carries its type into the update fold with no cast.
 * The group holds no selection itself — the URL query owns it — only the
 * roving-tabindex cursor while keyboard focus moves through the options.
 */
export const OrderRadio = RadioGroup.create<Order>()

const Editing = Schema.Struct({ id: Schema.Int })
const Removing = Schema.Struct({ id: Schema.Int, name: Schema.String })

// MODEL

export const Exchanges = AsyncData.Schema(ExchangePageResponse, Schema.String)

export const Model = Schema.Struct({
  query: ExchangesQuery,
  loadedQuery: Schema.Option(ExchangesQuery),
  exchanges: Exchanges.schema,
  orderRadio: RadioGroup.Model,
  editor: Dialog.Model,
  editing: Schema.Option(Editing),
  name: FieldValidation.Field(Schema.String),
  slug: FieldValidation.Field(Schema.String),
  coingeckoId: FieldValidation.Field(Schema.String),
  logo: FieldValidation.Field(Schema.String),
  baseCurrency: BaseCurrency,
  registeredOnCmc: Schema.Boolean,
  notice: Schema.Option(Schema.String),
  isSaving: Schema.Boolean,
  removeDialog: Dialog.Model,
  maybeRemoving: Schema.Option(Removing),
})

export type Model = typeof Model.Type

export type Exchanges = typeof Exchanges.schema.Type

// INIT

export const init = (query: ExchangesQuery): Model => ({
  query,
  loadedQuery: Option.none(),
  exchanges: AsyncData.Idle(),
  orderRadio: RadioGroup.init({ id: 'exchange-order' }),
  editor: Dialog.init({ id: 'exchange-editor' }),
  editing: Option.none(),
  name: FieldValidation.NotValidated({ value: '' }),
  slug: FieldValidation.NotValidated({ value: '' }),
  coingeckoId: FieldValidation.NotValidated({ value: '' }),
  logo: FieldValidation.NotValidated({ value: '' }),
  baseCurrency: 'usdt',
  registeredOnCmc: true,
  notice: Option.none(),
  isSaving: false,
  removeDialog: Dialog.init({ id: 'exchange-remove' }),
  maybeRemoving: Option.none(),
})

export const initialModel: Model = init(defaultExchangesQuery)

// FORM

export const isFormValid = (model: Model): boolean =>
  FieldValidation.allValid([
    [model.name, nameRules],
    [model.slug, slugRules],
    [model.coingeckoId, coingeckoIdRules],
    [model.logo, logoRules],
  ])

export const editorTitle = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'New exchange',
    onSome: () => `Edit ${model.name.value}`,
  })

export const confirmLabel = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'Add exchange',
    onSome: () => 'Save exchange',
  })

export const removeTitle = (model: Model): string =>
  Option.match(model.maybeRemoving, {
    onNone: () => 'Remove exchange',
    onSome: ({ name }) => `Remove ${name}?`,
  })
