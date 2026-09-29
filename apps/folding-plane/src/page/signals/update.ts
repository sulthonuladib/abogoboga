import { Array, Effect, Option, Order, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { AsyncData, Command, Update } from 'foldkit'
import { pushUrl, replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type Exchange, Query, call } from '../../api'
import { type SignalRow, freshnessWindowMs } from '../../api'
import {
  type SignalSort,
  type SignalsQuery,
  defaultSignalsQuery,
  signalsUrl,
} from '../../route'
import { Message } from './message'
import { Model, initialModel } from './model'

type UpdateReturn = Update.Return<Model, Message>

// COMMAND

/**
 * The exchange directory behind the row logos. It requires the API services
 * rather than providing them, so the browser runs it against its own origin.
 */
export const readExchanges = (): Effect.Effect<
  ReadonlyArray<Exchange>,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> =>
  Query.listExchanges({
    limit: Query.unlimited,
    page: 1,
    search: '',
    searchBy: ['name', 'slug'],
    sort: 'id',
    order: 'asc',
  }).pipe(Effect.map((page) => page.data))

export const FetchExchanges = Command.define('FetchExchanges', {
  messages: [Message.SettledFetchExchanges],
  execute: call(readExchanges()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchExchanges({ result })),
  ),
})

/**
 * A toolbar choice that becomes a navigation, so the URL always describes the
 * feed on screen and the choice survives a reload.
 */
export const NavigateSignals = Command.define('NavigateSignals', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateSignals],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateSignals())),
})

/**
 * The profit floor while it is being typed. Replacing rather than pushing keeps
 * a run of keystrokes out of the history, the way the search box does.
 */
export const ReplaceSignalsUrl = Command.define('ReplaceSignalsUrl', {
  args: { url: Schema.String },
  messages: [Message.CompletedReplaceSignalsUrl],
  execute: ({ url }) =>
    replaceUrl(url).pipe(Effect.as(Message.CompletedReplaceSignalsUrl())),
})

// FRESHNESS

/**
 * A row is live only while both of its tick timestamps sit inside the freshness
 * window. The server applies the same window when it builds a snapshot; this
 * local check lets a row age out between snapshots.
 */
const isFresh = (row: SignalRow, now: number): boolean =>
  row.buyTickTimestamp >= now - freshnessWindowMs &&
  row.sellTickTimestamp >= now - freshnessWindowMs

export const prune = (rows: ReadonlyArray<SignalRow>, now: number): ReadonlyArray<SignalRow> =>
  rows.filter((row) => isFresh(row, now))

// APPLY

/**
 * The socket delivered a snapshot. The parent drives this fact through this
 * capability rather than constructing a child Message, so the socket wiring
 * stays free of the page's Message union.
 */
export const receivedSignal = (
  rows: ReadonlyArray<SignalRow>,
): Update.Step<Model, Message> => (model) => ({
  model: modifyFields(model, { rows: () => rows }),
})

/**
 * A second passed. Rows whose ticks left the freshness window drop out.
 */
export const ticked = (now: number): Update.Step<Model, Message> => (model) => ({
  model: modifyFields(model, { rows: (rows) => prune(rows, now) }),
})

// SORT

/**
 * Rows ordered by the selected figure, most profitable first.
 */
export const sortedRows = (
  rows: ReadonlyArray<SignalRow>,
  sort: SignalSort,
): ReadonlyArray<SignalRow> =>
  Array.sort(Order.flip(Order.mapInput(Order.Number, (row: SignalRow): number => row[sort])))(rows)

// DERIVED

/**
 * A row is hidden when either side trades on a hidden exchange.
 */
export const isRowHidden = (row: SignalRow, query: SignalsQuery): boolean =>
  query.hiddenExchanges.includes(row.buyExchangeId) ||
  query.hiddenExchanges.includes(row.sellExchangeId)

const thresholdFromText = (value: string): number =>
  Option.match(Schema.decodeUnknownOption(Schema.FiniteFromString)(value.trim()), {
    onNone: () => defaultSignalsQuery.threshold,
    onSome: (threshold) => Math.max(defaultSignalsQuery.threshold, threshold),
  })

const withoutExchange = (ids: ReadonlyArray<number>, id: number): ReadonlyArray<number> =>
  Array.filter(ids, (candidate) => candidate !== id)

const withExchange = (ids: ReadonlyArray<number>, id: number): ReadonlyArray<number> =>
  ids.includes(id) ? ids : [...ids, id]

/**
 * The one row set both views read: rows below the profit floor and rows on a
 * hidden exchange drop out, then the rest sort. Deriving once here keeps the
 * cards and the table from ever disagreeing.
 */
export const derivedRows = (
  rows: ReadonlyArray<SignalRow>,
  query: SignalsQuery,
): ReadonlyArray<SignalRow> =>
  sortedRows(
    Array.filter(
      rows,
      (row) => row.profitPercent >= query.threshold && !isRowHidden(row, query),
    ),
    query.sort,
  )

// LOAD

const loadExchanges = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { exchanges: () => AsyncData.Loading() }),
  commands: [FetchExchanges()],
})

// INIT

/**
 * The page as it opens. The rows arrive over the socket; the exchange
 * directory is fetched once so row logos resolve. The toolbar state comes from
 * the route, so a shared or reloaded URL opens the same feed.
 */
export const init = (query: SignalsQuery): UpdateReturn =>
  loadExchanges(modifyFields(initialModel, { query: () => query }))

/**
 * Tell the page the URL named it. A page that never loaded a directory fetches
 * one; a page that did leaves it alone.
 */
export const entered = (model: Model): UpdateReturn =>
  AsyncData.isIdle(model.exchanges) ? loadExchanges(model) : { model }

/**
 * Tell the page the URL changed. The route owns the toolbar, so the page reads
 * the whole query back into its Model on every change.
 */
export const informRouteChanged = (
  model: Model,
  query: SignalsQuery,
): Update.Return<Model, Message> => ({
  model: modifyFields(model, { query: () => query }),
})

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ReceivedSignal: ({ rows }) => receivedSignal(rows)(model),

    Ticked: ({ now }) => ticked(now)(model),

    SelectedView: ({ view }) => ({
      model,
      commands: [NavigateSignals({ url: signalsUrl({ ...model.query, view }) })],
    }),

    SelectedSort: ({ sort }) => ({
      model,
      commands: [NavigateSignals({ url: signalsUrl({ ...model.query, sort }) })],
    }),

    UpdatedThreshold: ({ value }) => {
      const query = modifyFields(model.query, { threshold: () => thresholdFromText(value) })

      return {
        model: modifyFields(model, { query: () => query }),
        commands: [ReplaceSignalsUrl({ url: signalsUrl(query) })],
      }
    },

    ToggledExchangeVisibility: ({ id, isVisible }) => {
      const hiddenExchanges = isVisible
        ? withoutExchange(model.query.hiddenExchanges, id)
        : withExchange(model.query.hiddenExchanges, id)

      return {
        model,
        commands: [
          NavigateSignals({ url: signalsUrl({ ...model.query, hiddenExchanges }) }),
        ],
      }
    },

    CompletedNavigateSignals: () => ({ model }),
    CompletedReplaceSignalsUrl: () => ({ model }),

    SettledFetchExchanges: ({ result }) => ({
      model: modifyFields(model, { exchanges: AsyncData.settle(result) }),
    }),
  })
