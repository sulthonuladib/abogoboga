import { ChainOrderField } from '@lister/api/client'
import { Dialog } from '@foldkit/ui'
import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Command } from 'foldkit'

import { ChainPageResponse } from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSearch: { value: Schema.String },
  CompletedSearchChains: {},
  CompletedInterruptSearchChains: { outcome: Command.Interruptible.Outcome },
  CompletedNavigateChains: {},
  ClickedSort: { column: ChainOrderField },
  ClickedRetry: {},
  ClickedNewChain: {},
  ClickedEditChain: { id: Schema.Int, name: Schema.String, code: Schema.String },
  UpdatedChainName: { value: Schema.String },
  UpdatedChainCode: { value: Schema.String },
  ClickedSaveChain: {},
  SucceededSaveChain: { code: Schema.String },
  FailedSaveChain: { detail: Schema.String },
  ClickedRemoveChain: { id: Schema.Int, code: Schema.String },
  ClickedConfirmRemoveChain: {},
  SucceededRemoveChain: { code: Schema.String },
  FailedRemoveChain: { detail: Schema.String },
  SettledFetchChains: { result: Schema.Result(ChainPageResponse, Schema.String) },
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
