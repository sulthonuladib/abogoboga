import { AsyncData, FieldValidation } from 'foldkit'
import { Option, Schema } from 'effect'
import { Dialog } from '@foldkit/ui'
import { Exchange as ExchangeModel } from '@lister/domain'

import {
  ChainPageResponse,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  MarketListResponse,
} from '../../api'

// DATA

export const ExchangeData = AsyncData.Schema(ExchangeModel.json, Schema.String)

export const MarketsData = AsyncData.Schema(MarketListResponse, Schema.String)

export const CoinsData = AsyncData.Schema(CryptocurrencyPageResponse, Schema.String)

export const Metadata = AsyncData.Schema(CryptocurrencyMetadataResponse, Schema.String)

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

const SelectedCoin = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  symbol: Schema.String,
})

const SelectedMarket = Schema.Struct({
  marketId: Schema.Int,
  cryptocurrencyId: Schema.Int,
  label: Schema.String,
  symbol: Schema.String,
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
  exchangeId: Schema.Int,
  exchange: ExchangeData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
  // Assign dialog
  assignDialog: Dialog.Model,
  assignSearch: Schema.String,
  assignCoin: Schema.Option(SelectedCoin),
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
  metadata: Metadata.schema,
  linkSearch: Schema.String,
  linkChains: LinkChains.schema,
  linkChain: Schema.Option(SelectedChain),
  linkCode: FieldValidation.Field(Schema.String),
  linkWithdraw: Schema.Boolean,
  linkDeposit: Schema.Boolean,
  pendingToggles: Schema.Array(PendingToggle),
  removingLink: Schema.Option(RemovingLink),
  unlinkDialog: Dialog.Model,
  // Write state
  notice: Schema.Option(Schema.String),
  linksNotice: Schema.Option(Schema.String),
  isSaving: Schema.Boolean,
})

export type Model = typeof Model.Type

export type Exchange = typeof ExchangeData.schema.Type
export type Markets = typeof MarketsData.schema.Type
export type Coins = typeof CoinsData.schema.Type
export type Metadata = typeof Metadata.schema.Type
export type SelectedCoin = typeof SelectedCoin.Type
export type SelectedMarket = typeof SelectedMarket.Type
export type SelectedChain = typeof SelectedChain.Type

/**
 * The rows the server resolved before rendering. Each read arrives settled,
 * so a read that failed on the server still renders, with the reason on it
 * and a retry beside it.
 */
export const Seed = Schema.Struct({
  exchange: ExchangeData.schema,
  markets: MarketsData.schema,
  coins: CoinsData.schema,
})

export type Seed = typeof Seed.Type

// INIT

export const initFor = (exchangeId: number): Model => ({
  exchangeId,
  exchange: AsyncData.Idle(),
  markets: AsyncData.Idle(),
  coins: AsyncData.Idle(),
  assignDialog: Dialog.init({ id: 'exchange-detail-assign' }),
  assignSearch: '',
  assignCoin: Option.none(),
  assignSymbol: FieldValidation.NotValidated({ value: '' }),
  assignListed: true,
  assignTradeEnabled: true,
  editDialog: Dialog.init({ id: 'exchange-detail-edit' }),
  editing: Option.none(),
  editSymbol: FieldValidation.NotValidated({ value: '' }),
  editListed: true,
  editTradeEnabled: true,
  unassignDialog: Dialog.init({ id: 'exchange-detail-unassign' }),
  unassigning: Option.none(),
  linksDialog: Dialog.init({ id: 'exchange-detail-links' }),
  linkMode: 'manage',
  managing: Option.none(),
  metadata: AsyncData.Idle(),
  linkSearch: '',
  linkChains: AsyncData.Idle(),
  linkChain: Option.none(),
  linkCode: FieldValidation.NotValidated({ value: '' }),
  linkWithdraw: true,
  linkDeposit: true,
  pendingToggles: [],
  removingLink: Option.none(),
  unlinkDialog: Dialog.init({ id: 'exchange-detail-unlink' }),
  notice: Option.none(),
  linksNotice: Option.none(),
  isSaving: false,
})

// MISSING

/**
 * Whether a read's reason means the exchange is gone rather than unreadable.
 * The transport reports the status it answered with, so a 404 names a missing
 * exchange where any other reason names a failure with a retry.
 */
export const isMissing = (detail: string): boolean => detail.includes('404')

// FORM

export const isAssignValid = (model: Model): boolean =>
  Option.isSome(model.assignCoin) &&
  FieldValidation.allValid([[model.assignSymbol, symbolRules]])

export const isEditValid = (model: Model): boolean =>
  FieldValidation.allValid([[model.editSymbol, symbolRules]])

export const isLinkValid = (model: Model): boolean =>
  Option.isSome(model.linkChain) &&
  FieldValidation.allValid([[model.linkCode, chainCodeRules]])

// DESCRIPTION

/**
 * Header description for a loaded exchange, naming its base currency,
 * CoinGecko id, and CoinMarketCap state.
 */
export const identityDescription = (exchange: typeof ExchangeModel.json.Type): string =>
  `Base currency ${exchange.baseCurrency.toUpperCase()}. CoinGecko id ${exchange.coingeckoId}. ` +
  (exchange.registeredOnCmc ? 'Registered on CoinMarketCap.' : 'Not registered on CoinMarketCap.')
