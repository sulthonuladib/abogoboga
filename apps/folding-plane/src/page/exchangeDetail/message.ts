import { Schema } from 'effect'
import { Exchange as ExchangeModel } from '@lister/domain'
import { Dialog } from '@foldkit/ui'
import { defineMessageUnion } from 'foldkit/message'

import {
  ChainPageResponse,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  MarketListResponse,
} from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetry: {},
  SettledFetchExchange: { result: Schema.Result(ExchangeModel.json, Schema.String) },
  SettledFetchMarkets: { result: Schema.Result(MarketListResponse, Schema.String) },
  SettledFetchCoins: { result: Schema.Result(CryptocurrencyPageResponse, Schema.String) },
  // Assign
  ClickedAssignMarket: {},
  UpdatedAssignSearch: { value: Schema.String },
  PickedAssignCoin: { id: Schema.Int, name: Schema.String, symbol: Schema.String },
  UpdatedAssignSymbol: { value: Schema.String },
  ToggledAssignListed: { isChecked: Schema.Boolean },
  ToggledAssignTradeEnabled: { isChecked: Schema.Boolean },
  ClickedConfirmAssign: {},
  SucceededAssign: { exchangeSymbol: Schema.String },
  FailedAssign: { detail: Schema.String },
  // Edit
  ClickedEditMarket: { marketId: Schema.Int, cryptocurrencyId: Schema.Int, label: Schema.String, symbol: Schema.String, listed: Schema.Boolean, tradeEnabled: Schema.Boolean },
  UpdatedEditSymbol: { value: Schema.String },
  ToggledEditListed: { isChecked: Schema.Boolean },
  ToggledEditTradeEnabled: { isChecked: Schema.Boolean },
  ClickedConfirmEdit: {},
  SucceededEdit: {},
  FailedEdit: { detail: Schema.String },
  // Unassign
  ClickedUnassignMarket: { marketId: Schema.Int, cryptocurrencyId: Schema.Int, label: Schema.String, symbol: Schema.String },
  ClickedConfirmUnassign: {},
  SucceededUnassign: {},
  FailedUnassign: { detail: Schema.String },
  // Chain links
  ClickedManageLinks: { marketId: Schema.Int, cryptocurrencyId: Schema.Int, label: Schema.String, symbol: Schema.String },
  ClickedAddAnotherLink: {},
  ClickedBackToLinkList: {},
  SettledFetchMetadata: { result: Schema.Result(CryptocurrencyMetadataResponse, Schema.String) },
  UpdatedLinkSearch: { value: Schema.String },
  SettledFetchLinkChains: { result: Schema.Result(ChainPageResponse, Schema.String) },
  PickedLinkChain: { id: Schema.Int, code: Schema.String, name: Schema.String },
  CreatedLinkChain: { id: Schema.Int, code: Schema.String, name: Schema.String },
  FailedCreateChain: { detail: Schema.String },
  ClickedCreateChain: {},
  UpdatedLinkCode: { value: Schema.String },
  ToggledLinkWithdraw: { isChecked: Schema.Boolean },
  ToggledLinkDeposit: { isChecked: Schema.Boolean },
  ClickedAddLink: {},
  SucceededAddLink: { code: Schema.String },
  FailedAddLink: { detail: Schema.String },
  ClickedToggleLink: { marketId: Schema.Int, chainId: Schema.Int, linkId: Schema.Int, withdrawEnabled: Schema.Boolean, depositEnabled: Schema.Boolean, exchangeChainCode: Schema.String, exchangeChainName: Schema.NullOr(Schema.String) },
  SucceededToggleLink: {},
  FailedToggleLink: { linkId: Schema.Int, detail: Schema.String },
  ClickedUnlinkChain: { linkId: Schema.Int, code: Schema.String },
  ClickedConfirmUnlink: {},
  SucceededUnlink: {},
  FailedUnlink: { detail: Schema.String },
  // Dialogs
  GotAssignDialogMessage: { message: Dialog.Message },
  GotEditDialogMessage: { message: Dialog.Message },
  GotUnassignDialogMessage: { message: Dialog.Message },
  GotLinksDialogMessage: { message: Dialog.Message },
  GotUnlinkDialogMessage: { message: Dialog.Message },
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  ChangedCatalogue: {},
})

export type OutMessage = typeof OutMessage.Type
