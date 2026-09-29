import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ExchangeJson, SignalRow } from '../../api'
import { SignalSort, SignalView } from '../../route'

// MESSAGE

export const Message = defineMessageUnion({
  ReceivedSignal: { rows: Schema.Array(SignalRow) },
  Ticked: { now: Schema.Int },
  SelectedView: { view: SignalView },
  SelectedSort: { sort: SignalSort },
  UpdatedThreshold: { value: Schema.String },
  ToggledExchangeVisibility: { id: Schema.Int, isVisible: Schema.Boolean },
  CompletedNavigateSignals: {},
  CompletedReplaceSignalsUrl: {},
  SettledFetchExchanges: { result: Schema.Result(Schema.Array(ExchangeJson), Schema.String) },
})

export type Message = typeof Message.Type
