import { Array, Option } from 'effect'
import { Input } from '@foldkit/ui'
import { AsyncData, Submodel } from 'foldkit'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { Exchange, SignalRow } from '../../api'
import { ConnectionState } from '../../connection'
import { type SignalSort, type SignalView } from '../../route'
import { classNames } from '../../ui/classNames'
import { inlineCheck } from '../../ui/field'
import { filterBar, filterRow } from '../../ui/filters'
import { logo } from '../../ui/logo'
import { pageHeader } from '../../ui/pageHeader'
import { emptyState } from '../../ui/states'
import { body, emptyRow, head, row, table, td, th } from '../../ui/table'
import { Message } from './message'
import { Model } from './model'
import { derivedRows } from './update'

// VIEW

/**
 * The signal channel's page: one top-bar toolbar that carries every control
 * (view, sort, profit floor, exchange visibility, connection state) over the
 * same derived row set, rendered as cards or a dense table.
 */
export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, viewInputs, h) =>
    h.div([h.Class('flex flex-col gap-6')], [
      pageHeader({ title: 'Signals', h }),
      toolbar(model, viewInputs.connection, h),
      feedView(model, h),
    ]),
)

type ViewInputs = Readonly<{
  connection: ConnectionState
}>

// TOOLBAR

const toolbar = (model: Model, connection: ConnectionState, h: HtmlBuilder<Message>): Html =>
  filterBar(h, [
    filterRow(h, [
      viewControl(model, h),
      sortControl(model, h),
      thresholdControl(model, h),
      h.div([h.Class('ml-auto flex items-center')], [statusView(connection, h)]),
    ]),
    exchangeVisibility(model, h),
  ])

// SEGMENTED CONTROL

const segmentGroupClass =
  'inline-flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5'

const segmentButtonClass =
  'rounded-md px-2.5 py-1 text-xs font-medium transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96]'

const segmentedControl = <Value extends string>(
  input: Readonly<{
    label: string
    options: ReadonlyArray<Readonly<{ value: Value, label: string }>>
    selected: Value
    onSelect: (value: Value) => Message
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const { h } = input

  return h.div(
    [
      h.Role('group'),
      h.AriaLabel(input.label),
      h.Class(segmentGroupClass),
    ],
    input.options.map((option) =>
      segmentButton(option, input.selected, input.onSelect, h)),
  )
}

const segmentButton = <Value extends string>(
  option: Readonly<{ value: Value, label: string }>,
  selected: Value,
  onSelect: (value: Value) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const isActive = selected === option.value

  return h.button(
    [
      h.Type('button'),
      h.OnClick(onSelect(option.value)),
      h.AriaPressed(isActive ? 'true' : 'false'),
      h.Class(
        classNames(
          segmentButtonClass,
          isActive
            ? 'bg-card text-foreground shadow-[var(--shadow-border)]'
            : 'text-muted-foreground hover:text-foreground',
        ),
      ),
    ],
    [option.label],
  )
}

// VIEW TOGGLE

const signalViews: ReadonlyArray<Readonly<{ value: SignalView, label: string }>> = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
]

const viewControl = (model: Model, h: HtmlBuilder<Message>): Html =>
  segmentedControl({
    label: 'View',
    options: signalViews,
    selected: model.query.view,
    onSelect: (value) => Message.SelectedView({ view: value }),
    h,
  })

// SORT

const signalSorts: ReadonlyArray<Readonly<{ value: SignalSort, label: string }>> = [
  { value: 'profitPercent', label: 'Profit %' },
  { value: 'profitVolume', label: 'Profit volume' },
]

const sortControl = (model: Model, h: HtmlBuilder<Message>): Html =>
  segmentedControl({
    label: 'Sort signals',
    options: signalSorts,
    selected: model.query.sort,
    onSelect: (value) => Message.SelectedSort({ sort: value }),
    h,
  })

// THRESHOLD

const compactNumberClass =
  'h-8 w-20 rounded-lg border border-input bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring'

const thresholdControl = (model: Model, h: HtmlBuilder<Message>): Html =>
  Input.view(
    {
      id: 'signals-threshold',
      type: 'number',
      value: String(model.query.threshold),
      onInput: (value) => Message.UpdatedThreshold({ value }),
      isInvalid: false,
      toView: (attributes) =>
        h.div([h.Class('flex items-center gap-2')], [
          h.label(
            [h.For('signals-threshold'), h.Class('text-xs text-muted-foreground')],
            ['Min profit %'],
          ),
          h.input([
            ...attributes.input,
            h.Min('0'),
            h.Step('0.1'),
            h.AriaLabel('Minimum profit percent'),
            h.Class(compactNumberClass),
          ]),
        ]),
    },
    h,
  )

// EXCHANGE VISIBILITY

const exchangeVisibility = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.exchanges), {
    onNone: () => h.empty,
    onSome: (exchanges) =>
      Array.match(exchanges, {
        onEmpty: () => h.empty,
        onNonEmpty: (loaded) =>
          h.div(
            [
              h.Role('group'),
              h.AriaLabel('Exchange visibility'),
              h.Class(
                'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3',
              ),
            ],
            [
              h.span([h.Class('text-xs text-muted-foreground')], ['Exchanges']),
              ...loaded.map((exchange) =>
                inlineCheck({
                  id: `signals-exchange-${exchange.id}`,
                  label: exchange.name,
                  isChecked: !model.query.hiddenExchanges.includes(exchange.id),
                  onToggle: (isChecked) =>
                    Message.ToggledExchangeVisibility({
                      id: exchange.id,
                      isVisible: isChecked,
                    }),
                  h,
                })),
            ],
          ),
      }),
  })

// STATUS

const statusView = (
  connection: ConnectionState,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('status'),
      h.Class(
        'inline-flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1 text-xs',
      ),
    ],
    [
      h.span([h.Class(connectionDotClass(connection))]),
      h.span([h.Class('text-muted-foreground')], [connectionLabel(connection)]),
    ],
  )

const connectionDotClass = (connection: ConnectionState): string =>
  ConnectionState.match<string>(connection, {
    Connected: () => 'size-2 rounded-full bg-emerald-500',
    Connecting: () => 'size-2 animate-pulse rounded-full bg-amber-500',
    Disconnected: () => 'size-2 rounded-full bg-muted-foreground',
    Error: () => 'size-2 rounded-full bg-destructive',
  })

const connectionLabel = (connection: ConnectionState): string =>
  ConnectionState.match<string>(connection, {
    Connected: () => 'Live',
    Connecting: () => 'Connecting',
    Disconnected: () => 'Disconnected',
    Error: ({ detail }) => `Failed: ${detail}`,
  })

// FEED

const feedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  model.query.view === 'table' ? tableView(model, h) : cardsView(model, h)

/**
 * The one sentence a stripped feed explains itself with. A feed with no rows
 * yet is waiting on workers; a feed whose rows all failed a control names the
 * control.
 */
const emptyDescription = (model: Model): string =>
  Array.isReadonlyArrayEmpty(model.rows)
    ? 'No signals yet. Fresh, profitable routes appear as workers tick.'
    : 'No signals match the current controls. Lower the profit floor or unhide an exchange.'

const visibleExchanges = (model: Model): ReadonlyArray<Exchange> =>
  Option.getOrElse(AsyncData.getData(model.exchanges), () => [])

// ROUTE TONE

/**
 * The trade direction a signal moves through: the base currency of the buy
 * exchange into the base currency of the sell exchange. It drives the row's
 * colour, and its label keeps the direction readable without the colour.
 */
type RouteTone = Readonly<{ key: string; label: string }>

const routeTone = (
  signal: SignalRow,
  exchanges: ReadonlyArray<Exchange>,
): Option.Option<RouteTone> =>
  Option.flatMap(
    Array.findFirst(exchanges, (exchange) => exchange.id === signal.buyExchangeId),
    (buy) =>
      Option.map(
        Array.findFirst(exchanges, (exchange) => exchange.id === signal.sellExchangeId),
        (sell) => ({
          key: `${buy.baseCurrency}-${sell.baseCurrency}`,
          label: `${buy.baseCurrency.toUpperCase()} → ${sell.baseCurrency.toUpperCase()}`,
        }),
      ),
  )

const toneClass = (tone: RouteTone): string =>
  classNames(`route-${tone.key}`, 'route-accent border-l-4')

const routeChip = (tone: RouteTone, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.Class(
        'route-chip inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      ),
    ],
    [tone.label],
  )

const routeDot = (tone: RouteTone, h: HtmlBuilder<Message>): Html =>
  h.span([
    h.Role('img'),
    h.AriaLabel(tone.label),
    h.Title(tone.label),
    h.Class('route-dot inline-block size-2 shrink-0 rounded-full'),
  ])

// CARDS

const cardsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const exchanges = visibleExchanges(model)

  return Array.match(derivedRows(model.rows, model.query), {
    onEmpty: () =>
      emptyState({
        title: 'No signals',
        description: emptyDescription(model),
        h,
      }),
    onNonEmpty: (signals) =>
      h.div(
        [h.Class('grid gap-3 sm:grid-cols-2 xl:grid-cols-3')],
        signals.map((signal) => signalCard(signal, exchanges, h)),
      ),
  })
}

const signalCard = (
  signal: SignalRow,
  exchanges: ReadonlyArray<Exchange>,
  h: HtmlBuilder<Message>,
): Html => {
  const tone = routeTone(signal, exchanges)

  return h.keyed('article')(String(signal.opportunityId), [
    h.Class(
      classNames(
        'flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-[var(--shadow-border)]',
        Option.match(tone, { onNone: () => '', onSome: toneClass }),
      ),
    ),
  ], [
    h.header([h.Class('flex items-center justify-between gap-2')], [
      h.div([h.Class('flex items-center gap-2')], [
        h.span([h.Class('text-xs tabular-nums text-muted-foreground')], [
          `#${signal.opportunityId}`,
        ]),
        ...Option.match(tone, {
          onNone: () => [],
          onSome: (value) => [routeChip(value, h)],
        }),
      ]),
      h.div([h.Class('flex items-baseline gap-2')], [
        h.span([h.Class('text-sm font-semibold tabular-nums')], [
          `${signal.profitPercent.toFixed(2)}%`,
        ]),
        h.span([h.Class('text-xs tabular-nums text-muted-foreground')], [
          formatAmount(signal.profitVolume),
        ]),
      ]),
    ]),
    h.div([h.Class('grid grid-cols-2 gap-3')], [
      cardSide(
        {
          label: 'Buy',
          exchangeId: signal.buyExchangeId,
          exchangeSymbol: signal.buyExchangeSymbol,
          coin: signal.symbol,
          price: signal.buyPrice,
          volume: signal.buyVolume,
        },
        exchanges,
        h,
      ),
      cardSide(
        {
          label: 'Sell',
          exchangeId: signal.sellExchangeId,
          exchangeSymbol: signal.sellExchangeSymbol,
          coin: signal.symbol,
          price: signal.sellPrice,
          volume: signal.sellVolume,
        },
        exchanges,
        h,
      ),
    ]),
  ])
}

const cardSide = (
  input: Readonly<{
    label: string
    exchangeId: number
    exchangeSymbol: string
    coin: string
    price: number
    volume: number
  }>,
  exchanges: ReadonlyArray<Exchange>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-2 rounded-lg bg-muted/40 p-3')], [
    h.div([h.Class('flex items-center justify-between gap-2')], [
      exchangeMark(input.exchangeId, input.exchangeSymbol, exchanges, h),
      h.span([h.Class('text-xs font-medium text-muted-foreground')], [input.label]),
    ]),
    h.span([h.Class('text-sm font-medium')], [input.coin]),
    h.dl([h.Class('flex items-baseline justify-between gap-2')], [
      h.dt([h.Class('text-xs text-muted-foreground')], ['Price']),
      h.dd([h.Class('text-sm tabular-nums')], [formatAmount(input.price)]),
    ]),
    h.dl([h.Class('flex items-baseline justify-between gap-2')], [
      h.dt([h.Class('text-xs text-muted-foreground')], ['Volume']),
      h.dd([h.Class('text-sm tabular-nums')], [formatAmount(input.volume)]),
    ]),
  ])

// TABLE

const tableView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const exchanges = visibleExchanges(model)

  return table(h, [
    head(h, [
      th('Coin', h),
      th('Buy', h),
      th('Buy price', h, true),
      th('Buy vol', h, true),
      th('Sell', h),
      th('Sell price', h, true),
      th('Sell vol', h, true),
      th('Profit %', h, true),
      th('Profit', h, true),
    ]),
    body(h, rowsBody(model, exchanges, h)),
  ])
}

const rowsBody = (
  model: Model,
  exchanges: ReadonlyArray<Exchange>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(derivedRows(model.rows, model.query), {
    onEmpty: () => [
      row(h, [emptyRow(h, emptyDescription(model))]),
    ],
    onNonEmpty: (rows) => rows.map((signal) => signalRow(signal, exchanges, h)),
  })

const signalRow = (
  signal: SignalRow,
  exchanges: ReadonlyArray<Exchange>,
  h: HtmlBuilder<Message>,
): Html => {
  const tone = routeTone(signal, exchanges)

  return h.keyed('tr')(
    String(signal.opportunityId),
    Option.match(tone, {
      onNone: () => [],
      onSome: (value) => [h.Class(toneClass(value))],
    }),
    [
      td(h, h.span([h.Class('inline-flex items-center gap-2')], [
        ...Option.match(tone, {
          onNone: () => [],
          onSome: (value) => [routeDot(value, h)],
        }),
        h.span([h.Class('font-medium')], [signal.symbol]),
      ])),
      td(h, exchangeMark(signal.buyExchangeId, signal.buyExchangeSymbol, exchanges, h)),
      td(h, formatAmount(signal.buyPrice), { isNumeric: true }),
      td(h, formatAmount(signal.buyVolume), { isNumeric: true }),
      td(h, exchangeMark(signal.sellExchangeId, signal.sellExchangeSymbol, exchanges, h)),
      td(h, formatAmount(signal.sellPrice), { isNumeric: true }),
      td(h, formatAmount(signal.sellVolume), { isNumeric: true }),
      td(h, `${signal.profitPercent.toFixed(2)}%`, { isNumeric: true }),
      td(h, formatAmount(signal.profitVolume), { isNumeric: true }),
    ],
  )
}

const exchangeMark = (
  exchangeId: number,
  exchangeSymbol: string,
  exchanges: ReadonlyArray<Exchange>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(
    Array.findFirst(exchanges, (exchange) => exchange.id === exchangeId),
    {
      onNone: () => h.span([h.Class('text-muted-foreground')], [exchangeSymbol]),
      onSome: (exchange) =>
        h.span([h.Class('inline-flex items-center gap-1.5')], [
          logo({
            src: exchange.logo,
            fallback: exchange.slug,
            alt: exchange.name,
            h,
            sizeClass: 'size-5',
          }),
          h.span([h.Class('text-muted-foreground')], [exchangeSymbol]),
        ]),
    },
  )

const formatAmount = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 })
