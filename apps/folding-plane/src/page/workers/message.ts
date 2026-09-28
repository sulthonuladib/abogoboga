import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { WorkerStatus } from '../../api'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRetry: {},
  SettledFetchWorkers: { result: Schema.Result(Schema.Array(WorkerStatus), Schema.String) },
  ClickedStartWorker: { exchangeId: Schema.Int },
  ClickedStopWorker: { exchangeId: Schema.Int },
  SucceededStartWorker: { exchangeSlug: Schema.String },
  SucceededStopWorker: { exchangeSlug: Schema.String },
  FailedWorkerRequest: { detail: Schema.String },
})

export type Message = typeof Message.Type

// OUT MESSAGE

/**
 * A worker changed, so the running total in the rail is out of date.
 */
export const OutMessage = defineMessageUnion({
  ChangedWorkers: {},
})

export type OutMessage = typeof OutMessage.Type
