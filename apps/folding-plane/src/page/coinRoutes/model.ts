import { Dialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'

import {
  ChainPageResponse,
  CryptocurrencyMetadataResponse,
  ExchangePageResponse,
} from '../../api'

// DATA

export const Metadata = AsyncData.Schema(CryptocurrencyMetadataResponse, Schema.String)

export const AssignExchanges = AsyncData.Schema(ExchangePageResponse, Schema.String)

export const LinkChains = AsyncData.Schema(ChainPageResponse, Schema.String)

// FORM

const maxLength = 255

export const symbolRules = FieldValidation.makeRules({
  required: 'An exchange symbol is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'An exchange symbol is at most 255 characters.'),
  ],
})

export const chainCodeRules = FieldValidation.makeRules({
  required: 'An exchange chain code is required.',
  rules: [
    FieldValidation.Rule.maxLength(maxLength, 'An exchange chain code is at most 255 characters.'),
  ],
})

const SelectedMarket = Schema.Struct({
  marketId: Schema.Int,
  exchangeId: Schema.Int,
  name: Schema.String,
  symbol: Schema.String,
})

const SelectedExchange = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  slug: Schema.String,
})

const SelectedChain = Schema.Struct({
  id: Schema.Int,
  code: Schema.String,
  name: Schema.String,
})

const RemovingLink = Schema.Struct({
  linkId: Schema.Int,
  code: Schema.String,
})

const RouteDetail = Schema.Struct({
  fromId: Schema.Int,
  toId: Schema.Int,
})

const PendingToggle = Schema.Struct({
  linkId: Schema.Int,
  withdrawEnabled: Schema.Boolean,
  depositEnabled: Schema.Boolean,
})

/**
 * The chain-links dialog has two halves that share one open lifecycle: the
 * manage list of current links, and the add form for a new one.
 */
export const LinkMode = Schema.Literals(['manage', 'add'])
export type LinkMode = typeof LinkMode.Type

// MODEL

export const Model = Schema.Struct({
  coinId: Schema.Int,
  metadata: Metadata.schema,
  // Assign dialog
  assignDialog: Dialog.Model,
  assignSearch: Schema.String,
  assignExchanges: AssignExchanges.schema,
  assignExchange: Schema.Option(SelectedExchange),
  assignSymbol: FieldValidation.Field(Schema.String),
  assignListed: Schema.Boolean,
  assignTradeEnabled: Schema.Boolean,
  // Edit dialog
  editDialog: Dialog.Model,
  editing: Schema.Option(SelectedMarket),
  editSymbol: FieldValidation.Field(Schema.String),
  editListed: Schema.Boolean,
  editTradeEnabled: Schema.Boolean,
  // Unassign dialog
  unassignDialog: Dialog.Model,
  unassigning: Schema.Option(SelectedMarket),
  // Chain-links dialog
  linksDialog: Dialog.Model,
  linkMode: LinkMode,
  managing: Schema.Option(SelectedMarket),
  linkSearch: Schema.String,
  linkChains: LinkChains.schema,
  linkChain: Schema.Option(SelectedChain),
  linkCode: FieldValidation.Field(Schema.String),
  linkWithdraw: Schema.Boolean,
  linkDeposit: Schema.Boolean,
  pendingToggles: Schema.Array(PendingToggle),
  removingLink: Schema.Option(RemovingLink),
  unlinkDialog: Dialog.Model,
  // Route detail dialog
  routeDialog: Dialog.Model,
  routeDetail: Schema.Option(RouteDetail),
  // Write state
  notice: Schema.Option(Schema.String),
  linksNotice: Schema.Option(Schema.String),
  isSaving: Schema.Boolean,
})

export type Model = typeof Model.Type
export type Metadata = typeof Metadata.schema.Type
export type SelectedMarket = typeof SelectedMarket.Type
export type SelectedExchange = typeof SelectedExchange.Type
export type SelectedChain = typeof SelectedChain.Type

export const Seed = Schema.Struct({
  metadata: Metadata.schema,
})

export type Seed = typeof Seed.Type

// INIT

export const initFor = (coinId: number): Model => ({
  coinId,
  metadata: AsyncData.Idle(),
  assignDialog: Dialog.init({ id: 'coin-routes-assign' }),
  assignSearch: '',
  assignExchanges: AsyncData.Idle(),
  assignExchange: Option.none(),
  assignSymbol: FieldValidation.NotValidated({ value: '' }),
  assignListed: true,
  assignTradeEnabled: true,
  editDialog: Dialog.init({ id: 'coin-routes-edit' }),
  editing: Option.none(),
  editSymbol: FieldValidation.NotValidated({ value: '' }),
  editListed: true,
  editTradeEnabled: true,
  unassignDialog: Dialog.init({ id: 'coin-routes-unassign' }),
  unassigning: Option.none(),
  linksDialog: Dialog.init({ id: 'coin-routes-links' }),
  linkMode: 'manage',
  managing: Option.none(),
  linkSearch: '',
  linkChains: AsyncData.Idle(),
  linkChain: Option.none(),
  linkCode: FieldValidation.NotValidated({ value: '' }),
  linkWithdraw: true,
  linkDeposit: true,
  pendingToggles: [],
  removingLink: Option.none(),
  unlinkDialog: Dialog.init({ id: 'coin-routes-unlink' }),
  routeDialog: Dialog.init({ id: 'coin-routes-detail' }),
  routeDetail: Option.none(),
  notice: Option.none(),
  linksNotice: Option.none(),
  isSaving: false,
})

export const initialModel: Model = initFor(0)

export const isMissing = (detail: string): boolean => detail.includes('404')

// FORM

export const isAssignValid = (model: Model): boolean =>
  Option.isSome(model.assignExchange) &&
  FieldValidation.allValid([[model.assignSymbol, symbolRules]])

export const isEditValid = (model: Model): boolean =>
  FieldValidation.allValid([[model.editSymbol, symbolRules]])

export const isLinkValid = (model: Model): boolean =>
  Option.isSome(model.linkChain) &&
  FieldValidation.allValid([[model.linkCode, chainCodeRules]])
