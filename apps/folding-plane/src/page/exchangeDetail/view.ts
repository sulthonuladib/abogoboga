import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinMetadata, CoinPage, MarketAssignment } from '../../api'
import { coinRoutesUrl, defaultExchangesQuery, exchangesUrl, pageSizeChoices } from '../../route'
import { badge } from '../../ui/badge'
import { dialog } from '../../ui/dialog'
import { inlineCheck, textField, toggleField } from '../../ui/field'
import { filterBar, filterRow, filterStatus, pageSizeSelect } from '../../ui/filters'
import { formatCount, pendingCount } from '../../ui/format'
import { icon } from '../../ui/icon'
import { action, iconAction, pageHeader, statStrip } from '../../ui/pageHeader'
import { clientPager } from '../../ui/pagination'
import { pickerSearch } from '../../ui/picker'
import { emptyState, errorPanel } from '../../ui/states'
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
import { searchField } from '../../ui/search'
import { Message } from './message'
import { type MarketSort, Model, identityDescription, isAssignValid, isEditValid, isLinkValid, isMissing } from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    headerView(model, h),
    bodyView(model, h),
    assignView(model, h),
    editView(model, h),
    unassignView(model, h),
    linksView(model, h),
    unlinkView(model, h),
  ]))

// HEADER

const headerView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const actions: ReadonlyArray<Html> = [
    action({
      label: 'Assign market',
      onClick: Message.ClickedAssignMarket(),
      isPrimary: true,
      h,
    }),
  ]

  return Option.match(AsyncData.getData(model.exchange), {
    onNone: () =>
      pageHeader({
        title: 'Exchange',
        description: AsyncData.isFailure(model.exchange)
          ? 'This exchange could not be loaded.'
          : 'Loading exchange.',
        back: { href: exchangesUrl(defaultExchangesQuery), label: 'Exchanges' },
        actions,
        h,
      }),
    onSome: (exchange) =>
      pageHeader({
        title: exchange.name,
        description: identityDescription(exchange),
        back: { href: exchangesUrl(defaultExchangesQuery), label: 'Exchanges' },
        actions,
        h,
      }),
  })
}

// BODY

const bodyView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const exchangeError = AsyncData.getError(model.exchange)

  if (Option.isSome(exchangeError) && isMissing(exchangeError.value)) {
    return emptyState({
      title: 'Exchange not found',
      description:
        'This exchange no longer exists. It may have been removed from the exchanges page.',
      action: h.a(
        [
          h.Href(exchangesUrl(defaultExchangesQuery)),
          h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
        ],
        ['Back to exchanges'],
      ),
      h,
    })
  }

  const failure = firstFailure(model)

  if (Option.isSome(failure)) {
    return errorPanel({
      title: 'Could not load exchange',
      detail: failure.value,
      onRetry: Message.ClickedRetry(),
      h,
    })
  }

  return h.div([h.Class('flex flex-col gap-6')], [
    statsView(model, h),
    marketsView(model, h),
  ])
}

const firstFailure = (model: Model): Option.Option<string> =>
  Option.match(AsyncData.getError(model.exchange), {
    onNone: () =>
      Option.match(AsyncData.getError(model.markets), {
        onNone: () => AsyncData.getError(model.coins),
        onSome: (detail) => Option.some(detail),
      }),
    onSome: (detail) => Option.some(detail),
  })

// STATS

const statsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const markets = AsyncData.getData(model.markets)

  return statStrip(
    Option.match(markets, {
      onNone: () => [
        { label: 'Markets listed', value: pendingCount, hint: 'visible in the coin list' },
        { label: 'Trade enabled', value: pendingCount, hint: 'routes may trade through them' },
        { label: 'Assigned coins', value: pendingCount, hint: 'market assignments on this exchange' },
      ],
      onSome: (rows) => [
        {
          label: 'Markets listed',
          value: formatCount(rows.filter((market) => market.listed).length),
          hint: 'visible in the coin list',
        },
        {
          label: 'Trade enabled',
          value: formatCount(rows.filter((market) => market.tradeEnabled).length),
          hint: 'routes may trade through them',
        },
        {
          label: 'Assigned coins',
          value: formatCount(rows.length),
          hint: 'market assignments on this exchange',
        },
      ],
    }),
    h,
  )
}

// MARKETS

const marketsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.markets, {
    onIdle: () => marketsTableView(loadingRows(h), h),
    onLoading: () => marketsTableView(loadingRows(h), h),
    onRefreshing: (rows) => marketsListing(rows, model, h),
    onFailure: () => marketsTableView(loadingRows(h), h),
    onStale: ({ data }) => marketsListing(data, model, h),
    onSuccess: (rows) =>
      Array.match(rows, {
        onEmpty: () =>
          emptyState({
            title: 'No markets yet',
            description:
              'Assign a coin to this exchange and its market appears here.',
            action: h.div([h.Class('flex justify-center')], [
              action({
                label: 'Assign market',
                onClick: Message.ClickedAssignMarket(),
                isPrimary: true,
                h,
              }),
            ]),
            h,
          }),
        onNonEmpty: () => marketsListing(rows, model, h),
      }),
  })

const marketsTableView = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [
      th('Coin', h),
      th('Exchange symbol', h),
      th('Listed', h),
      th('Trade enabled', h),
      th('Actions', h, true),
    ]),
    body(h, rows),
  ])

/**
 * One enriched row: the market with the coin fields the table searches and
 * sorts by, resolved once so every stage below reads the same values.
 */
type EnrichedMarket = Readonly<{
  market: MarketAssignment
  label: string
  symbol: string
  name: string
}>

const enrichMarkets = (
  rows: ReadonlyArray<MarketAssignment>,
  model: Model,
): Readonly<{ enriched: ReadonlyArray<EnrichedMarket>, coinsById: ReadonlyMap<number, CoinPage['data'][number]>, isIndexLoaded: boolean }> => {
  const coins = AsyncData.getData(model.coins)
  const coinsById = Option.match(coins, {
    onNone: () => new Map<number, CoinPage['data'][number]>(),
    onSome: (page) => new Map(page.data.map((coin) => [coin.id, coin] as const)),
  })
  const isIndexLoaded = Option.isSome(coins)

  return {
    enriched: rows.map((market) => {
      const coin = coinsById.get(market.cryptocurrencyId)

      return {
        market,
        label: marketLabel(market, coinsById, isIndexLoaded),
        symbol: coin?.symbol ?? '',
        name: coin?.name ?? '',
      }
    }),
    coinsById,
    isIndexLoaded,
  }
}

const filterMarkets = (
  rows: ReadonlyArray<EnrichedMarket>,
  needle: string,
): ReadonlyArray<EnrichedMarket> => {
  const search = needle.trim().toLowerCase()

  if (search === '') {
    return rows
  }

  return rows.filter((row) =>
    row.label.toLowerCase().includes(search) ||
    row.symbol.toLowerCase().includes(search) ||
    row.name.toLowerCase().includes(search) ||
    row.market.exchangeSymbol.toLowerCase().includes(search)
  )
}

const sortKeyOf = (row: EnrichedMarket, sort: MarketSort): string =>
  sort === 'coin'
    ? (row.symbol === '' ? row.label : row.symbol).toLowerCase()
    : row.market.exchangeSymbol.toLowerCase()

const sortMarkets = (
  rows: ReadonlyArray<EnrichedMarket>,
  sort: MarketSort,
  order: 'asc' | 'desc',
): ReadonlyArray<EnrichedMarket> => {
  const direction = order === 'asc' ? 1 : -1

  return [...rows].sort((left, right) => {
    const leftKey = sortKeyOf(left, sort)
    const rightKey = sortKeyOf(right, sort)

    if (leftKey === rightKey) {
      return left.market.id - right.market.id
    }

    return leftKey < rightKey ? -direction : direction
  })
}

/**
 * The markets table with its toolbar and pager. The rows arrive whole —
 * `market.list` has no server paging — so search, sort, and slicing run here
 * over the in-memory array. The page clamps against the filtered count, so a
 * removal or a narrower search cannot strand the pager past the last page.
 */
const marketsListing = (
  rows: ReadonlyArray<MarketAssignment>,
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const { enriched, coinsById, isIndexLoaded } = enrichMarkets(rows, model)
  const matching = filterMarkets(enriched, model.marketSearch)
  const sorted = sortMarkets(matching, model.marketSort, model.marketOrder)
  const limit = Math.max(model.marketLimit, 1)
  const pages = Math.max(Math.ceil(sorted.length / limit), 1)
  const page = Math.min(Math.max(model.marketPage, 1), pages)
  const pageRows = sorted.slice((page - 1) * limit, page * limit)

  return h.div([h.Class('flex flex-col gap-3')], [
    filterBar(h, [
      filterRow(h, [
        searchField({
          id: 'markets-search',
          value: model.marketSearch,
          placeholder: 'Search markets',
          label: 'Search markets',
          onInput: (value) => Message.UpdatedMarketSearch({ value }),
          wrapperClass: 'w-full min-w-52 flex-1 sm:max-w-none',
          h,
        }),
        filterStatus(h, marketsStatus(model.marketSearch, sorted.length, rows.length)),
      ]),
    ]),
    table(h, [
      head(h, marketColumns(model, h)),
      body(h, marketPageRows(pageRows, coinsById, isIndexLoaded, model.marketSearch, h)),
    ]),
    h.div([h.Class('flex flex-wrap items-center justify-between gap-3')], [
      Array.match(sorted, {
        onEmpty: () =>
          clientPager({
            page: 1,
            pages: 1,
            from: 0,
            to: 0,
            total: 0,
            onPage: (next) => Message.ChangedMarketPage({ page: next }),
            h,
          }),
        onNonEmpty: (matching) =>
          clientPager({
            page,
            pages,
            from: (page - 1) * limit + 1,
            to: Math.min(page * limit, matching.length),
            total: matching.length,
            onPage: (next) => Message.ChangedMarketPage({ page: next }),
            h,
          }),
      }),
      pageSizeSelect({
        id: 'markets-page-size',
        value: model.marketLimit,
        choices: pageSizeChoices,
        onChange: (value) => Message.ChangedMarketPageSize({ value }),
        h,
      }),
    ]),
  ])
}

const marketsStatus = (search: string, matching: number, total: number): string =>
  search.trim() === ''
    ? `${formatCount(total)} ${total === 1 ? 'market' : 'markets'}`
    : `${formatCount(matching)} of ${formatCount(total)} · Matching “${search.trim()}”`

const marketColumns = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  sortableTh({
    label: 'Coin',
    column: 'coin',
    sort: model.marketSort,
    order: model.marketOrder,
    onSort: (column) => Message.ClickedMarketSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Exchange symbol',
    column: 'symbol',
    sort: model.marketSort,
    order: model.marketOrder,
    onSort: (column) => Message.ClickedMarketSort({ column }),
    h,
  }),
  th('Listed', h),
  th('Trade enabled', h),
  th('Actions', h, true),
]

const marketPageRows = (
  rows: ReadonlyArray<EnrichedMarket>,
  coinsById: ReadonlyMap<number, CoinPage['data'][number]>,
  isIndexLoaded: boolean,
  search: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(rows, {
    onEmpty: () => [
      row(h, [
        emptyRow(
          h,
          search.trim() === ''
            ? 'No markets on this page.'
            : `No markets match “${search.trim()}”. Try a shorter search.`,
        ),
      ]),
    ],
    onNonEmpty: (page) =>
      page.map(({ market }) =>
        h.keyed('tr')(String(market.id), [], [
          td(h, coinCell(market, coinsById, isIndexLoaded, h)),
          td(h, market.exchangeSymbol),
          td(h, badge(market.listed ? 'listed' : 'not listed', h, market.listed ? 'positive' : 'neutral')),
          td(h, badge(market.tradeEnabled ? 'enabled' : 'disabled', h, market.tradeEnabled ? 'info' : 'neutral')),
          td(
            h,
            h.div([h.Class('flex items-center justify-end gap-1')], [
              iconAction({
                label: `Manage chains for ${marketLabel(market, coinsById, isIndexLoaded)}`,
                icon: icon('chain', h, 'size-3.5'),
                onClick: Message.ClickedManageLinks({
                  marketId: market.id,
                  cryptocurrencyId: market.cryptocurrencyId,
                  label: marketLabel(market, coinsById, isIndexLoaded),
                  symbol: market.exchangeSymbol,
                }),
                h,
              }),
              iconAction({
                label: `Edit ${marketLabel(market, coinsById, isIndexLoaded)} market`,
                icon: icon('pencil', h, 'size-3.5'),
                onClick: Message.ClickedEditMarket({
                  marketId: market.id,
                  cryptocurrencyId: market.cryptocurrencyId,
                  label: marketLabel(market, coinsById, isIndexLoaded),
                  symbol: market.exchangeSymbol,
                  listed: market.listed,
                  tradeEnabled: market.tradeEnabled,
                }),
                h,
              }),
              iconAction({
                label: `Unassign ${marketLabel(market, coinsById, isIndexLoaded)}`,
                icon: icon('trash', h, 'size-3.5'),
                onClick: Message.ClickedUnassignMarket({
                  marketId: market.id,
                  cryptocurrencyId: market.cryptocurrencyId,
                  label: marketLabel(market, coinsById, isIndexLoaded),
                  symbol: market.exchangeSymbol,
                }),
                h,
              }),
            ]),
            { isNumeric: true },
          ),
        ])),
  })

const marketLabel = (
  market: MarketAssignment,
  coinsById: ReadonlyMap<number, CoinPage['data'][number]>,
  isIndexLoaded: boolean,
): string => {
  const coin = coinsById.get(market.cryptocurrencyId)

  return coin === undefined
    ? isIndexLoaded
      ? `Coin #${market.cryptocurrencyId}`
      : 'market'
    : coin.symbol
}

const coinCell = (
  market: MarketAssignment,
  coinsById: ReadonlyMap<number, CoinPage['data'][number]>,
  isIndexLoaded: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  const coin = coinsById.get(market.cryptocurrencyId)

  if (coin === undefined) {
    return h.span([h.Class('text-muted-foreground')], [
      isIndexLoaded ? `Coin #${market.cryptocurrencyId}` : '…',
    ])
  }

  return h.a(
    [
      h.Href(coinRoutesUrl(coin.id)),
      h.Class('underline-offset-4 hover:underline'),
    ],
    [
      h.span([h.Class('font-medium')], [coin.symbol]),
      ' ',
      h.span([h.Class('text-muted-foreground')], [coin.name]),
    ],
  )
}

// ASSIGN

const assignView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.assignDialog,
    title: 'Assign market',
    description: 'Pick the coin this exchange lists and the symbol it trades under there.',
    size: 'lg',
    confirmLabel: 'Confirm assign',
    isConfirmDisabled: !isAssignValid(model) || model.isSaving,
    onConfirm: Message.ClickedConfirmAssign(),
    toParentMessage: (message) => Message.GotAssignDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model.notice, h),
      pickerSearch({
        id: 'assign-coin-search',
        label: 'Search coins',
        value: model.assignSearch,
        placeholder: 'Search coins',
        onInput: (value) => Message.UpdatedAssignSearch({ value }),
        h,
      }),
      coinPicker(model, h),
      textField({
        id: 'assign-symbol',
        label: 'Exchange symbol',
        field: model.assignSymbol,
        hint: 'As the exchange writes it, for example BTCUSDT.',
        placeholder: 'BTCUSDT',
        onInput: (value) => Message.UpdatedAssignSymbol({ value }),
        h,
      }),
      h.div([h.Class('flex items-center gap-4')], [
        toggleField({
          id: 'assign-listed',
          label: 'Listed',
          isChecked: model.assignListed,
          onToggle: (isChecked) => Message.ToggledAssignListed({ isChecked }),
          h,
        }),
        toggleField({
          id: 'assign-trade-enabled',
          label: 'Trade enabled',
          isChecked: model.assignTradeEnabled,
          onToggle: (isChecked) => Message.ToggledAssignTradeEnabled({ isChecked }),
          h,
        }),
      ]),
    ]),
    h,
  })

const coinPicker = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.coins, {
    onIdle: () => h.p([h.Class('text-xs text-muted-foreground')], ['Search for the coin to assign.']),
    onLoading: () => h.p([h.Class('text-xs text-muted-foreground'), h.Role('status')], ['Loading coins…']),
    onRefreshing: (page) => coinOptions(filterCoins(page.data, model.assignSearch), model, h),
    onFailure: (detail) => h.p([h.Class('text-xs text-destructive')], [detail]),
    onStale: ({ data }) => coinOptions(filterCoins(data.data, model.assignSearch), model, h),
    onSuccess: (page) => coinOptions(filterCoins(page.data, model.assignSearch), model, h),
  })

const filterCoins = (
  coins: ReadonlyArray<CoinPage['data'][number]>,
  search: string,
): ReadonlyArray<CoinPage['data'][number]> => {
  const needle = search.trim().toLowerCase()

  if (needle === '') {
    return coins
  }

  return coins.filter((coin) =>
    coin.symbol.toLowerCase().includes(needle) ||
    coin.name.toLowerCase().includes(needle)
  )
}

const coinOptions = (
  coins: ReadonlyArray<CoinPage['data'][number]>,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  coins.length === 0
    ? h.p([h.Class('text-xs text-muted-foreground')], ['No coins found. Try a shorter search.'])
    : h.div([h.Class('flex max-h-44 flex-col gap-1 overflow-y-auto'), h.Role('listbox'), h.AriaLabel('Coins')], [
      ...coins.map((coin) => {
        const isSelected = Option.match(model.assignCoin, {
          onNone: () => false,
          onSome: (picked) => picked.id === coin.id,
        })

        return h.button(
          [
            h.Type('button'),
            h.OnClick(Message.PickedAssignCoin({ id: coin.id, name: coin.name, symbol: coin.symbol })),
            h.Role('option'),
            h.AriaSelected(isSelected),
            h.Class(
              isSelected
                ? 'rounded-lg bg-muted px-2.5 py-1.5 text-left text-sm'
                : 'rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted/60',
            ),
          ],
          [
            h.span([h.Class('font-medium')], [coin.symbol]),
            ' ',
            h.span([h.Class('text-xs text-muted-foreground')], [coin.name]),
          ],
        )
      }),
    ])

// EDIT

const editView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.editDialog,
    title: Option.match(model.editing, {
      onNone: () => 'Edit market',
      onSome: ({ label }) => `Edit ${label} market`,
    }),
    description: 'Listing and trading flags are what the scanner reads; the exchange symbol is how the market is named.',
    confirmLabel: 'Save market',
    isConfirmDisabled: !isEditValid(model) || model.isSaving,
    onConfirm: Message.ClickedConfirmEdit(),
    toParentMessage: (message) => Message.GotEditDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model.notice, h),
      textField({
        id: 'edit-market-symbol',
        label: 'Exchange symbol',
        field: model.editSymbol,
        onInput: (value) => Message.UpdatedEditSymbol({ value }),
        h,
      }),
      h.div([h.Class('flex items-center gap-4')], [
        toggleField({
          id: 'edit-listed',
          label: 'Listed',
          isChecked: model.editListed,
          onToggle: (isChecked) => Message.ToggledEditListed({ isChecked }),
          h,
        }),
        toggleField({
          id: 'edit-trade-enabled',
          label: 'Trade enabled',
          isChecked: model.editTradeEnabled,
          onToggle: (isChecked) => Message.ToggledEditTradeEnabled({ isChecked }),
          h,
        }),
      ]),
    ]),
    h,
  })

// UNASSIGN

const unassignView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.unassignDialog,
    title: Option.match(model.unassigning, {
      onNone: () => 'Unassign market',
      onSome: ({ label }) => `Unassign ${label}?`,
    }),
    description: 'The market and all of its chain links are deleted; worker coverage for this coin shrinks.',
    confirmLabel: 'Unassign market',
    isDestructive: true,
    size: 'sm',
    onConfirm: Message.ClickedConfirmUnassign(),
    toParentMessage: (message) => Message.GotUnassignDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-3')], [
      ...noticeView(model.notice, h),
      h.p([h.Class('text-sm')], [
        Option.match(model.unassigning, {
          onNone: () => '',
          onSome: ({ label, symbol }) =>
            `This exchange no longer lists ${label} under ${symbol}. Re-assigning restores the market without its chain links.`,
        }),
      ]),
    ]),
    h,
  })

// LINKS

const linksOf = (
  metadata: CoinMetadata,
  marketId: number,
): CoinMetadata['exchanges'][number]['chains'] => {
  const market = metadata.exchanges.find((candidate) => candidate.marketId === marketId)

  return market?.chains ?? []
}

const linksView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.linksDialog,
    size: 'lg',
    title: Option.match(model.managing, {
      onNone: () => 'Chain links',
      onSome: ({ label }) => `Chains for ${label}`,
    }),
    description: 'A route exists between two markets only when one side can withdraw and the other can deposit on the same chain.',
    confirmLabel: 'Add chain link',
    isConfirmDisabled: !isLinkValid(model) || model.isSaving,
    onConfirm: model.linkMode === 'add' ? Message.ClickedAddLink() : undefined,
    toParentMessage: (message) => Message.GotLinksDialogMessage({ message }),
    content: renderLinkHalf(model, h),
    h,
  })

const renderLinkHalf = (model: Model, h: HtmlBuilder<Message>): Html => {
  if (model.linkMode === 'add') {
    return addLinkForm(model, h)
  }

  return manageLinks(model, h)
}

const manageLinks = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    ...noticeView(model.linksNotice, h),
    currentLinks(model, h),
    h.button(
      [
        h.Type('button'),
        h.OnClick(Message.ClickedAddAnotherLink()),
        h.Class('self-start rounded-lg border border-dashed px-3 py-1.5 text-sm hover:bg-muted/60'),
      ],
      ['Link another chain'],
    ),
  ])

const addLinkForm = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-4')], [
    ...noticeView(model.linksNotice, h),
    h.button(
      [
        h.Type('button'),
        h.OnClick(Message.ClickedBackToLinkList()),
        h.Class('self-start text-xs text-muted-foreground hover:text-foreground'),
      ],
      ['← Back to links'],
    ),
    h.div([h.Class('flex flex-col gap-4 rounded-2xl border border-dashed p-2')], [
      h.p([h.Class('text-sm font-medium')], ['Link another chain']),
      pickerSearch({
        id: 'link-chain-search',
        label: 'Search chains',
        value: model.linkSearch,
        placeholder: 'Search chains',
        onInput: (value) => Message.UpdatedLinkSearch({ value }),
        h,
      }),
      chainPicker(model, h),
      textField({
        id: 'link-code',
        label: 'Exchange chain code',
        field: model.linkCode,
        hint: 'The code this exchange uses, for example ERC20.',
        placeholder: 'ERC20',
        onInput: (value) => Message.UpdatedLinkCode({ value }),
        h,
      }),
      h.div([h.Class('flex items-center gap-4')], [
        toggleField({
          id: 'link-withdraw',
          label: 'Withdraw',
          isChecked: model.linkWithdraw,
          onToggle: (isChecked) => Message.ToggledLinkWithdraw({ isChecked }),
          h,
        }),
        toggleField({
          id: 'link-deposit',
          label: 'Deposit',
          isChecked: model.linkDeposit,
          onToggle: (isChecked) => Message.ToggledLinkDeposit({ isChecked }),
          h,
        }),
      ]),
    ]),
  ])

const currentLinks = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.metadata), {
    onNone: () => h.p([h.Class('text-sm text-muted-foreground')], ['No chains linked yet.']),
    onSome: (metadata) =>
      Option.match(model.managing, {
        onNone: () => h.p([h.Class('text-sm text-muted-foreground')], ['No chains linked yet.']),
        onSome: ({ marketId }) => {
          const links = linksOf(metadata, marketId)

          if (links.length === 0) {
            return h.p([h.Class('text-sm text-muted-foreground')], ['No chains linked yet.'])
          }

          return h.ul([h.Class('flex flex-col divide-y rounded-lg border')], [
            ...links.map((link) => {
              const pending = model.pendingToggles.find((toggle) => toggle.linkId === link.linkId)
              const withdrawEnabled = pending?.withdrawEnabled ?? link.withdrawEnabled
              const depositEnabled = pending?.depositEnabled ?? link.depositEnabled

              return h.keyed('li')(
                String(link.linkId),
                [h.Class('flex flex-wrap items-center gap-2 px-3 py-2')],
                [
                  h.div([h.Class('min-w-0 flex-1')], [
                    h.p([h.Class('text-sm font-medium uppercase')], [link.code]),
                    h.p([h.Class('truncate text-xs text-muted-foreground')], [
                      `${link.name} (exchange code ${link.exchangeChainCode})`,
                    ]),
                  ]),
                  inlineCheck({
                    id: `link-withdraw-${link.linkId}`,
                    label: 'Withdraw',
                    isChecked: withdrawEnabled,
                    onToggle: (isChecked) =>
                      Message.ClickedToggleLink({
                        marketId,
                        chainId: link.id,
                        linkId: link.linkId,
                        withdrawEnabled: isChecked,
                        depositEnabled,
                        exchangeChainCode: link.exchangeChainCode,
                        exchangeChainName: link.exchangeChainName,
                      }),
                    h,
                  }),
                  inlineCheck({
                    id: `link-deposit-${link.linkId}`,
                    label: 'Deposit',
                    isChecked: depositEnabled,
                    onToggle: (isChecked) =>
                      Message.ClickedToggleLink({
                        marketId,
                        chainId: link.id,
                        linkId: link.linkId,
                        withdrawEnabled,
                        depositEnabled: isChecked,
                        exchangeChainCode: link.exchangeChainCode,
                        exchangeChainName: link.exchangeChainName,
                      }),
                    h,
                  }),
                  iconAction({
                    label: `Unlink ${link.code}`,
                    icon: icon('trash', h, 'size-3.5'),
                    onClick: Message.ClickedUnlinkChain({ linkId: link.linkId, code: link.code }),
                    h,
                  }),
                ],
              )
            }),
          ])
        },
      }),
  })

const chainPicker = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.linkChains, {
    onIdle: () => h.p([h.Class('text-xs text-muted-foreground')], ['Search for the chain to link.']),
    onLoading: () => h.p([h.Class('text-xs text-muted-foreground'), h.Role('status')], ['Loading chains…']),
    onRefreshing: (page) => chainOptions(page.data, model, h),
    onFailure: (detail) => h.p([h.Class('text-xs text-destructive')], [detail]),
    onStale: ({ data }) => chainOptions(data.data, model, h),
    onSuccess: (page) => chainOptions(page.data, model, h),
  })

const chainOptions = (
  chains: ReadonlyArray<{ id: number, code: string, name: string }>,
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const search = model.linkSearch.trim()
  const exact = chains.some(
    (chain) => chain.code.toLowerCase() === search.toLowerCase() && search !== '',
  )

  return h.div([h.Class('flex max-h-44 flex-col gap-1 overflow-y-auto'), h.Role('listbox'), h.AriaLabel('Chains')], [
    ...chains.map((chain) => {
      const isSelected = Option.match(model.linkChain, {
        onNone: () => false,
        onSome: (picked) => picked.id === chain.id,
      })

      return h.button(
        [
          h.Type('button'),
          h.OnClick(Message.PickedLinkChain({ id: chain.id, code: chain.code, name: chain.name })),
          h.Role('option'),
          h.AriaSelected(isSelected),
          h.Class(
            isSelected
              ? 'rounded-lg bg-muted px-2.5 py-1.5 text-left text-sm'
              : 'rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted/60',
          ),
        ],
        [
          h.span([h.Class('font-medium uppercase')], [chain.code]),
          ' ',
          h.span([h.Class('text-xs text-muted-foreground')], [chain.name]),
        ],
      )
    }),
    ...(search === '' || exact
      ? []
      : [
        h.button(
          [
            h.Type('button'),
            h.OnClick(Message.ClickedCreateChain()),
            h.Class('rounded-lg border border-dashed px-2.5 py-1.5 text-left text-sm hover:bg-muted/60'),
          ],
          [`Add chain “${search}”`],
        ),
      ]),
  ])
}

// UNLINK

const unlinkView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.unlinkDialog,
    title: Option.match(model.removingLink, {
      onNone: () => 'Unlink chain',
      onSome: ({ code }) => `Unlink ${code}?`,
    }),
    description: 'Routes through this chain disappear immediately; re-linking restores them.',
    confirmLabel: 'Unlink chain',
    isDestructive: true,
    size: 'sm',
    onConfirm: Message.ClickedConfirmUnlink(),
    toParentMessage: (message) => Message.GotUnlinkDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-3')], [
      ...noticeView(model.linksNotice, h),
    ]),
    h,
  })

// NOTICE

const noticeView = (
  notice: Option.Option<string>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Option.match(notice, {
    onNone: () => [],
    onSome: (detail) => [
      h.p(
        [h.Class('rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive')],
        [detail],
      ),
    ],
  })
