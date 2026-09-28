import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinStat, CoinStatPage } from '../../api'
import { type CoinsQuery, coinRoutesUrl, coinsUrl, pageSizeChoices } from '../../route'
import { badge } from '../../ui/badge'
import { dialog } from '../../ui/dialog'
import { selectField, textField } from '../../ui/field'
import { pageSizeSelect, searchFieldsField } from '../../ui/filters'
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
    scopeView(model, h),
    editorView(model, h),
    removeView(model, h),
  ]))

// CONTROLS

const flagChoices = [
  { value: 'all', label: 'All coins' },
  { value: 'blocked', label: 'Blocked routes' },
  { value: 'single', label: 'Single market' },
] as const

const searchFieldChoices = [
  { field: 'symbol', label: 'Symbol' },
  { field: 'name', label: 'Name' },
  { field: 'id', label: 'Id' },
  { field: 'slug', label: 'Slug' },
  { field: 'coingeckoId', label: 'CoinGecko id' },
] as const

const scopeLabel = (query: CoinsQuery): string =>
  Option.match(query.exchangeId, {
    onSome: (id) => `Exchange #${id}`,
    onNone: () =>
      Option.match(query.chainId, {
        onSome: (id) => `Chain #${id}`,
        onNone: () => 'Scope',
      }),
  })

const hasScope = (query: CoinsQuery): boolean =>
  Option.isSome(query.exchangeId) || Option.isSome(query.chainId)

const flagLabel = (flag: CoinsQuery['flag']): string =>
  flag === 'blocked' ? 'Blocked routes' : flag === 'single' ? 'Single market' : 'All coins'

const statusText = (query: CoinsQuery): string => {
  if (query.search === '' && query.flag === 'all' && !hasScope(query)) {
    return 'All coins'
  }

  const parts: Array<string> = []

  if (query.search !== '') {
    parts.push(`Matching “${query.search}”`)
  }

  if (query.flag !== 'all') {
    parts.push(flagLabel(query.flag))
  }

  if (hasScope(query)) {
    parts.push(scopeLabel(query))
  }

  return parts.join(' · ')
}

const scopeControl = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex items-center gap-2')], [
    h.button(
      [
        h.Type('button'),
        h.OnClick(Message.ClickedScope()),
        h.Class(
          'h-9 rounded-lg bg-card px-3 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted',
        ),
      ],
      [scopeLabel(model.query)],
    ),
    ...(hasScope(model.query)
      ? [
        h.button(
          [
            h.Type('button'),
            h.OnClick(Message.ClickedClearScope()),
            h.AriaLabel('Clear scope'),
            h.Class('text-xs text-muted-foreground underline-offset-4 hover:underline'),
          ],
          ['Clear'],
        ),
      ]
      : []),
  ])

const controlsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    h.div([h.Class('flex flex-wrap items-center gap-3')], [
      searchField({
        id: 'coin-search',
        value: model.query.search,
        placeholder: 'Search coins',
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
      scopeControl(model, h),
      h.p([h.Class('text-sm text-muted-foreground')], [statusText(model.query)]),
    ]),
    searchFieldsField({
      legend: 'Search fields',
      choices: searchFieldChoices,
      selected: model.query.searchBy,
      onToggle: (field, isChecked) => Message.ToggledSearchField({ field, isChecked }),
      h,
    }),
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
  h.div([h.Class('flex flex-wrap items-center justify-between gap-3')], [
    pagination({ meta, toHref: (page) => coinsUrl({ ...query, page }), h }),
    pageSizeSelect({
      id: 'coins-page-size',
      value: query.limit,
      choices: pageSizeChoices,
      onChange: (value) => Message.ChangedPageSize({ value }),
      h,
    }),
  ])

// SCOPE

const scopeHint = (text: string, h: HtmlBuilder<Message>): Html =>
  h.p([h.Class('text-xs text-muted-foreground')], [text])

const scopeError = (detail: string, h: HtmlBuilder<Message>): Html =>
  h.p([h.Class('text-xs text-destructive')], [detail])

const scopeExchangeList = (
  exchanges: ReadonlyArray<{ id: number, name: string, slug: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('listbox'),
      h.AriaLabel('Exchanges'),
      h.Class('flex max-h-44 flex-col gap-1 overflow-y-auto'),
    ],
    exchanges.map((exchange) =>
      h.button(
        [
          h.Type('button'),
          h.OnClick(Message.PickedScopeExchange({ id: exchange.id, name: exchange.name })),
          h.Role('option'),
          h.Class('rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted/60'),
        ],
        [
          h.span([h.Class('font-medium')], [exchange.name]),
          ' ',
          h.span([h.Class('text-xs text-muted-foreground')], [exchange.slug]),
        ],
      )
    ),
  )

const scopeChainList = (
  chains: ReadonlyArray<{ id: number, name: string, code: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('listbox'),
      h.AriaLabel('Chains'),
      h.Class('flex max-h-44 flex-col gap-1 overflow-y-auto'),
    ],
    chains.map((chain) =>
      h.button(
        [
          h.Type('button'),
          h.OnClick(Message.PickedScopeChain({ id: chain.id, code: chain.code, name: chain.name })),
          h.Role('option'),
          h.Class('rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted/60'),
        ],
        [
          h.span([h.Class('font-medium uppercase')], [chain.code]),
          ' ',
          h.span([h.Class('text-xs text-muted-foreground')], [chain.name]),
        ],
      )
    ),
  )

const scopeExchangeOptions = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.scopeExchanges, {
    onIdle: () => scopeHint('Search for the exchange to scope by.', h),
    onLoading: () => scopeHint('Loading exchanges…', h),
    onFailure: (detail) => scopeError(detail, h),
    onRefreshing: (page) => scopeExchangeList(page.data, h),
    onStale: ({ data }) => scopeExchangeList(data.data, h),
    onSuccess: (page) =>
      page.data.length === 0
        ? scopeHint('No exchanges match.', h)
        : scopeExchangeList(page.data, h),
  })

const scopeChainOptions = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.scopeChains, {
    onIdle: () => scopeHint('Search for the chain to scope by.', h),
    onLoading: () => scopeHint('Loading chains…', h),
    onFailure: (detail) => scopeError(detail, h),
    onRefreshing: (page) => scopeChainList(page.data, h),
    onStale: ({ data }) => scopeChainList(data.data, h),
    onSuccess: (page) =>
      page.data.length === 0
        ? scopeHint('No chains match.', h)
        : scopeChainList(page.data, h),
  })

const scopeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.scopeDialog,
    title: 'Scope the coin listing',
    description: 'Show only the coins listed on one exchange, or the coins that carry one chain.',
    toParentMessage: (message) => Message.GotScopeDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      selectField({
        id: 'scope-kind',
        label: 'Scope by',
        value: model.scopeKind,
        choices: [
          { value: 'exchange', label: 'Exchange' },
          { value: 'chain', label: 'Chain' },
        ],
        onChange: (value) =>
          Message.ChangedScopeKind({ kind: value === 'chain' ? 'chain' : 'exchange' }),
        h,
      }),
      searchField({
        id: 'scope-search',
        value: model.scopeSearch,
        placeholder: 'Search',
        onInput: (value) => Message.UpdatedScopeSearch({ value }),
        h,
      }),
      model.scopeKind === 'exchange'
        ? scopeExchangeOptions(model, h)
        : scopeChainOptions(model, h),
    ]),
    h,
  })

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
