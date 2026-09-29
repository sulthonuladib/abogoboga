import { Schema } from 'effect'
import { AsyncData } from 'foldkit'

import { ExchangeJson, SignalRow } from '../../api'
import { SignalsQuery, defaultSignalsQuery } from '../../route'

// MODEL

/**
 * The exchange directory, cached for the page's lifetime so a row's exchange
 * id maps to a logo without a second request per row.
 */
export const Exchanges = AsyncData.Schema(Schema.Array(ExchangeJson), Schema.String)

export type Exchanges = typeof Exchanges.schema.Type

/**
 * The signal page's rows. The socket replaces them whole on each snapshot, so
 * there is no merge state and no per-row identity beyond the opportunity id.
 * The toolbar state lives in `query`, which the route owns.
 */
export const Model = Schema.Struct({
  rows: Schema.Array(SignalRow),
  exchanges: Exchanges.schema,
  query: SignalsQuery,
})

export type Model = typeof Model.Type

// INIT

export const initialModel: Model = {
  rows: [],
  exchanges: AsyncData.Idle(),
  query: defaultSignalsQuery,
}
