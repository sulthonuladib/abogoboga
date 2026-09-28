import { Option, Schema } from 'effect'
import { AsyncData } from 'foldkit'

import { WorkerStatus } from '../../api'

// MODEL

export const Workers = AsyncData.Schema(Schema.Array(WorkerStatus), Schema.String)

export const Model = Schema.Struct({
  workers: Workers.schema,
  notice: Schema.Option(Schema.String),
  pendingIds: Schema.Array(Schema.Int),
})

export type Model = typeof Model.Type

export type Workers = typeof Workers.schema.Type

// INIT

export const initialModel: Model = {
  workers: AsyncData.Idle(),
  notice: Option.none(),
  pendingIds: [],
}

// PENDING

export const isPending = (model: Model, exchangeId: number): boolean =>
  model.pendingIds.includes(exchangeId)
