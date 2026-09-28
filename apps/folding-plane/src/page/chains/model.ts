import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'

import { ChainPageResponse } from '../../api'
import { ChainsQuery, defaultChainsQuery } from '../../route'

// WINDOW

export const pageSize = 20

// FORM

const maxLength = 255

export const nameRules = FieldValidation.makeRules({
  required: 'A chain name is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A chain name is at most 255 characters.'),
  ],
})

export const codeRules = FieldValidation.makeRules({
  required: 'A chain code is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'A chain code is at most 255 characters.'),
  ],
})

const Editing = Schema.Struct({ id: Schema.Int })
const Removing = Schema.Struct({ id: Schema.Int, code: Schema.String })

// MODEL

export const Chains = AsyncData.Schema(ChainPageResponse, Schema.String)

export const Model = Schema.Struct({
  query: ChainsQuery,
  chains: Chains.schema,
  editor: Dialog.Model,
  editing: Schema.Option(Editing),
  name: FieldValidation.Field(Schema.String),
  code: FieldValidation.Field(Schema.String),
  notice: Schema.Option(Schema.String),
  isSaving: Schema.Boolean,
  removeDialog: Dialog.Model,
  maybeRemoving: Schema.Option(Removing),
})

export type Model = typeof Model.Type

export type Chains = typeof Chains.schema.Type

// INIT

export const init = (query: ChainsQuery): Model => ({
  query,
  chains: AsyncData.Idle(),
  editor: Dialog.init({ id: 'chain-editor' }),
  editing: Option.none(),
  name: FieldValidation.NotValidated({ value: '' }),
  code: FieldValidation.NotValidated({ value: '' }),
  notice: Option.none(),
  isSaving: false,
  removeDialog: Dialog.init({ id: 'chain-remove' }),
  maybeRemoving: Option.none(),
})

export const initialModel: Model = init(defaultChainsQuery)



// FORM

export const isFormValid = (model: Model): boolean =>
  FieldValidation.allValid([
    [model.name, nameRules],
    [model.code, codeRules],
  ])

export const editorTitle = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'New chain',
    onSome: () => `Edit ${model.code.value}`,
  })

export const confirmLabel = (model: Model): string =>
  Option.match(model.editing, {
    onNone: () => 'Add chain',
    onSome: () => 'Save chain',
  })

export const removeTitle = (model: Model): string =>
  Option.match(model.maybeRemoving, {
    onNone: () => 'Remove chain',
    onSome: ({ code }) => `Remove ${code}?`,
  })
