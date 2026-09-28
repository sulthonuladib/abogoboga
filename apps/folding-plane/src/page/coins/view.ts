import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinStat, CoinStatPage } from '../../api'
import { type CoinsQuery, coinRoutesUrl, coinsUrl } from '../../route'
import { badge } from '../../ui/badge'
import { dialog } from '../../ui/dialog'
import { selectField, textField } from '../../ui/field'
import { formatCount } from '../../ui/format'
import { icon } from '../../ui/icon'
import { action, iconAction, pageHeader } from '../../ui/pageHeader'
import { pagination } from '../../ui/pagination'
import { searchField } from '../../ui/search'
import { errorPanel, staleNotice } from '../../ui/states'
import {
  body,
  emptyRow,
  head,
  loadingRows,
  row,
  sortableTh,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import {
  Model,
  confirmLabel,
  editorTitle,
  isEditing,
  isFormValid,
  removeTitle,
} from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    pageHeader({
      title: 'Coins',
      description:
        'Coverage per coin: how many exchanges list it, on how many chains, and how many market pairs have no transfer route.',
      actions: [
        action({
          label: 'New coin',
          onClick: Message.ClickedNewCoin(),
          isPrimary: true,
          h,
        }),
      ],
      h,
    }),
    controlsView(model, h),
    coinsView(model, h),
    pagerView(model, h),
    editorView(model, h),
    removeView(model, h),
  ]))

// CONTROLS

const flagChoices = [
  { value: 'all', label: 'All coins' },
  { value: 'blocked', label: 'Blocked routes' },
  { value: 'single', label: 'Single market' },
] as const

const flagLabel = (flag: CoinsQuery['flag']): string =>
  flag === 'blocked' ? 'Blocked routes' : flag === 'single' ? 'Single market' : 'All coins'

const statusText = (query: CoinsQuery): string => {
  if (query.search === '' && query.flag === 'all') {
    return 'All coins'
  }

  const parts: Array<string> = []

  if (query.search !== '') {
    parts.push(`Matching “${query.search}”`)
  }

  if (query.flag !== 'all') {
    parts.push(flagLabel(query.flag))
  }

  return parts.join(' · ')
}

const controlsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-wrap items-center gap-3')], [
    searchField({
      id: 'coin-search',
      value: model.query.search,
      placeholder: 'Search by symbol or name',
      onInput: (value) => Message.UpdatedSearch({ value }),
      h,
    }),
    h.div([h.Class('w-full sm:w-48')], [
      selectField({
        id: 'coin-coverage',
        label: 'Coverage',
        value: model.query.flag,
        choices: [...flagChoices],
        onChange: (value) =>
          Message.ChangedFlag({
            flag: value === 'blocked' ? 'blocked' : value === 'single' ? 'single' : 'all',
          }),
        h,
      }),
    ]),
    h.p([h.Class('text-sm text-muted-foreground')], [statusText(model.query)]),
  ])

// COINS

const coinsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchDataSplitEmpty(model.coins, {
    onIdle: () => coinsTableView(model, loadingRows(h), h),
    onLoading: () => coinsTableView(model, loadingRows(h), h),
    onFailure: (detail) =>
      errorPanel({
        title: 'Could not load coins',
        detail,
        onRetry: Message.ClickedRetry(),
        h,
      }),
    onData: (page) => coinsTableView(model, coinRows(page, model, h), h),
  })

const coinsTableView = (
  model: Model,
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    table(h, [head(h, columnsView(model, h)), body(h, rows)]),
    ...Option.match(AsyncData.getError(model.coins), {
      onNone: () => [],
      onSome: (detail) => [
        staleNotice({ detail, onRetry: Message.ClickedRetry(), h }),
      ],
    }),
  ])

const columnsView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  sortableTh({
    label: 'Coin',
    column: 'symbol',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  th('Name', h),
  sortableTh({
    label: 'Markets',
    column: 'markets',
    sort: model.query.sort,
    order: model.query.order,
    isNumeric: true,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Chains',
    column: 'chains',
    sort: model.query.sort,
    order: model.query.order,
    isNumeric: true,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Blocked',
    column: 'blocked',
    sort: model.query.sort,
    order: model.query.order,
    isNumeric: true,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  th('Actions', h, true),
]

const isFiltered = (query: CoinsQuery): boolean =>
  query.search !== '' || query.flag !== 'all'

const coinRows = (
  page: CoinStatPage,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(page.data, {
    onEmpty: () => [
      row(h, [
        emptyRow(
          h,
          isFiltered(model.query)
            ? 'No coins match. Try a shorter search or a different coverage filter.'
            : 'No coins yet. Add the first coin, then assign it to exchanges.',
        ),
      ]),
    ],
    onNonEmpty: (coins) =>
      coins.map((coin) =>
        h.keyed('tr')(String(coin.id), [], [
          td(
            h,
            h.a(
              [
                h.Href(coinRoutesUrl(coin.id)),
                h.Class('font-medium uppercase underline-offset-4 hover:underline'),
              ],
              [coin.symbol],
            ),
          ),
          td(h, coin.name),
          td(h, marketsCell(coin, h), { isNumeric: true }),
          td(h, formatCount(coin.chains), { isNumeric: true }),
          td(h, blockedCell(coin, h), { isNumeric: true }),
          td(
            h,
            h.div([h.Class('flex items-center justify-end gap-1')], [
              iconAction({
                label: `Edit ${coin.symbol}`,
                icon: icon('pencil', h, 'size-3.5'),
                onClick: Message.ClickedEditCoin({
                  id: coin.id,
                  name: coin.name,
                  symbol: coin.symbol,
                  slug: coin.slug,
                  coingeckoId: coin.coingeckoId,
                  logo: coin.logo,
                }),
                h,
              }),
              iconAction({
                label: `Remove ${coin.symbol}`,
                icon: icon('trash', h, 'size-3.5'),
                onClick: Message.ClickedRemoveCoin({
                  id: coin.id,
                  symbol: coin.symbol,
                }),
                h,
              }),
            ]),
            { isNumeric: true },
          ),
        ])),
  })

const marketsCell = (coin: CoinStat, h: HtmlBuilder<Message>): Html =>
  coin.markets <= 1
    ? h.span([h.Class('inline-flex items-center justify-end gap-2')], [
      badge('thin', h),
      h.span([h.Class('tabular-nums')], [formatCount(coin.markets)]),
    ])
    : h.span([h.Class('tabular-nums')], [formatCount(coin.markets)])

const blockedCell = (coin: CoinStat, h: HtmlBuilder<Message>): Html =>
  coin.blocked === 0
    ? h.span([h.Class('text-muted-foreground')], ['0'])
    : h.span([h.Class('font-medium tabular-nums text-destructive')], [
      formatCount(coin.blocked),
    ])

const pagerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.coins, {
    onIdle: () => h.empty,
    onLoading: () => h.empty,
    onRefreshing: (data) => pager(data.meta, model.query, h),
    onFailure: () => h.empty,
    onStale: ({ data }) => pager(data.meta, model.query, h),
    onSuccess: (data) => pager(data.meta, model.query, h),
  })

const pager = (
  meta: CoinStatPage['meta'],
  query: CoinsQuery,
  h: HtmlBuilder<Message>,
): Html =>
  pagination({ meta, toHref: (page) => coinsUrl({ ...query, page }), h })

// DIALOG

const editorView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.editor,
    title: editorTitle(model),
    description:
      'The CoinGecko id and slug are unique; the symbol is what exchanges trade under.',
    confirmLabel: confirmLabel(model),
    isConfirmDisabled: !isFormValid(model) || model.isSaving,
    onConfirm: Message.ClickedSaveCoin(),
    toParentMessage: (message) => Message.GotEditorMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model, h),
      h.div([h.Class('grid grid-cols-2 gap-4')], [
        textField({
          id: 'coin-symbol',
          label: 'Symbol',
          field: model.symbol,
          placeholder: 'BTC',
          isAutofocus: true,
          onInput: (value) => Message.UpdatedCoinSymbol({ value }),
          h,
        }),
        textField({
          id: 'coin-name',
          label: 'Name',
          field: model.name,
          placeholder: 'Bitcoin',
          onInput: (value) => Message.UpdatedCoinName({ value }),
          h,
        }),
      ]),
      textField({
        id: 'coin-slug',
        label: 'Slug',
        field: model.slug,
        hint: 'URL-friendly id, for example bitcoin.',
        placeholder: 'bitcoin',
        onInput: (value) => Message.UpdatedCoinSlug({ value }),
        h,
      }),
      textField({
        id: 'coin-coingecko-id',
        label: 'CoinGecko id',
        field: model.coingeckoId,
        hint: 'Used by the scanner to match the coin.',
        placeholder: 'bitcoin',
        onInput: (value) => Message.UpdatedCoinCoingeckoId({ value }),
        h,
      }),
      ...(isEditing(model) ? [] : [
        textField({
          id: 'coin-logo',
          label: 'Logo',
          field: model.logo,
          hint: 'Optional; leave empty to render the symbol instead.',
          placeholder: 'https://…',
          onInput: (value) => Message.UpdatedCoinLogo({ value }),
          h,
        }),
      ]),
      ...requiredHintView(model, h),
    ]),
    h,
  })

const requiredHintView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  isFormValid(model)
    ? []
    : [
      h.p([h.Class('text-xs text-muted-foreground')], [
        'Symbol, name, slug, and CoinGecko id are required.',
      ]),
    ]

const removeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.removeDialog,
    title: removeTitle(model),
    description:
      'Market assignments and chain links for this coin are deleted with it, and worker coverage shrinks.',
    confirmLabel: 'Remove coin',
    isDestructive: true,
    onConfirm: Message.ClickedConfirmRemoveCoin(),
    toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-3')], [
      ...noticeView(model, h),
      h.p([h.Class('text-sm')], [
        Option.match(model.maybeRemoving, {
          onNone: () => '',
          onSome: ({ symbol }) =>
            `${symbol} is removed with every market and chain link that names it. Re-adding the coin does not restore those routes.`,
        }),
      ]),
    ]),
    h,
  })

/**
 * The reason the last write failed, shown where the write was made.
 */
const noticeView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(model.notice, {
    onNone: () => [],
    onSome: (detail) => [
      h.p(
        [h.Class('rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive')],
        [detail],
      ),
    ],
  })
