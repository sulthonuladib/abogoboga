import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinMetadata } from '../../api'
import { coinsUrl, defaultCoinsQuery, exchangeDetailUrl } from '../../route'
import { badge } from '../../ui/badge'
import { dialog } from '../../ui/dialog'
import { inlineCheck, textField, toggleField } from '../../ui/field'
import { formatCount } from '../../ui/format'
import { icon } from '../../ui/icon'
import { logo } from '../../ui/logo'
import { action, iconAction, pageHeader } from '../../ui/pageHeader'
import { pickerSearch } from '../../ui/picker'
import { emptyState, errorPanel, sectionHeading } from '../../ui/states'
import {
  body,
  head,
  loadingRows,
  row,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import { Model, isAssignValid, isEditValid, isLinkValid } from './model'
import { statusLabel, statusOf, viableFor } from './update'

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
    routeDetailView(model, h),
  ]))

// HEADER

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.metadata), {
    onNone: () =>
      pageHeader({
        title: 'Coin routes',
        back: { href: coinsUrl(defaultCoinsQuery), label: 'Coins' },
        actions: [
          action({
            label: 'Assign market',
            onClick: Message.ClickedAssignMarket(),
            isPrimary: true,
            h,
          }),
        ],
        h,
      }),
    onSome: (metadata) =>
      pageHeader({
        title: `${metadata.symbol} routes`,
        back: { href: coinsUrl(defaultCoinsQuery), label: 'Coins' },
        mark: logo({
          src: metadata.logo,
          fallback: metadata.symbol,
          alt: metadata.symbol,
          isDecorative: true,
          sizeClass: 'size-9',
          h,
        }),
        actions: [
          action({
            label: 'Assign market',
            onClick: Message.ClickedAssignMarket(),
            isPrimary: true,
            h,
          }),
        ],
        h,
      }),
  })

// BODY

const bodyView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const error = AsyncData.getError(model.metadata)

  if (Option.isSome(error) && error.value.includes('404')) {
    return emptyState({
      title: 'Coin not found',
      description: 'This coin no longer exists. It may have been removed from the coins page.',
      action: h.a(
        [
          h.Href(coinsUrl(defaultCoinsQuery)),
          h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
        ],
        ['Back to coins'],
      ),
      h,
    })
  }

  if (Option.isSome(error)) {
    return errorPanel({
      title: 'Could not load routes',
      detail: error.value,
      onRetry: Message.ClickedRetry(),
      h,
    })
  }

  return AsyncData.match(model.metadata, {
    onIdle: () => loadingView(h),
    onLoading: () => loadingView(h),
    onRefreshing: (metadata) => loadedView(metadata, model, h),
    onFailure: (detail) =>
      errorPanel({
        title: 'Could not load routes',
        detail,
        onRetry: Message.ClickedRetry(),
        h,
      }),
    onStale: ({ data }) => loadedView(data, model, h),
    onSuccess: (metadata) => loadedView(metadata, model, h),
  })
}

const loadingView = (h: HtmlBuilder<Message>): Html =>
  table(h, [
    head(h, [
      th('Exchange', h),
      th('Exchange symbol', h),
      th('Listed', h),
      th('Trade enabled', h),
      th('Chains', h),
      th('Actions', h, true),
    ]),
    body(h, loadingRows(h)),
  ])

const loadedView = (
  metadata: CoinMetadata,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-6')], [
    statsView(metadata, h),
    marketsSection(metadata, model, h),
    matrixSection(metadata, model, h),
  ])

// STATS

const statsView = (metadata: CoinMetadata, h: HtmlBuilder<Message>): Html => {
  const markets = metadata.exchanges
  const chainIds = new Set<number>()

  for (const market of markets) {
    for (const chain of market.chains) {
      chainIds.add(chain.id)
    }
  }

  let blocked = 0
  let oneWay = 0

  for (const from of markets) {
    for (const to of markets) {
      if (from.marketId === to.marketId) {
        continue
      }

      const status = statusOf(metadata, from.marketId, to.marketId)

      if (status === 'none') {
        blocked += 1
      } else if (status === 'one-way-blocked' || status === 'one-way-other') {
        oneWay += 1
      }
    }
  }

  return h.dl(
    [h.Class('grid grid-cols-2 gap-3 lg:grid-cols-4')],
    [
      statCell('Markets', formatCount(markets.length), h),
      statCell('Chains', formatCount(chainIds.size), h),
      statCell('Blocked pairs', blocked === 0 ? '0' : formatCount(blocked), h, blocked > 0),
      statCell('One-way pairs', formatCount(oneWay), h),
    ],
  )
}

const statCell = (
  label: string,
  value: string,
  h: HtmlBuilder<Message>,
  isCritical?: boolean | undefined,
): Html =>
  h.div(
    [h.Class('rounded-2xl bg-card px-3 py-2.5 shadow-[var(--shadow-border)]')],
    [
      h.dt([h.Class('text-xs text-muted-foreground')], [label]),
      h.dd([h.Class('mt-0.5')], [
        h.span(
          [h.Class(isCritical === true ? 'text-2xl font-semibold tabular-nums text-destructive' : 'text-2xl font-semibold tabular-nums')],
          [value],
        ),
      ]),
    ],
  )

// MARKETS

const marketsSection = (
  metadata: CoinMetadata,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.section([h.Class('flex flex-col gap-3')], [
    sectionHeading({
      title: 'Markets',
      note: 'Every exchange that lists this coin.',
      h,
    }),
    marketsTable(metadata, model, h),
  ])

const marketsTable = (
  metadata: CoinMetadata,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [
      th('Exchange', h),
      th('Exchange symbol', h),
      th('Listed', h),
      th('Trade enabled', h),
      th('Chains', h),
      th('Actions', h, true),
    ]),
    body(h, marketRows(metadata, model, h)),
  ])

const marketRows = (
  metadata: CoinMetadata,
  _model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(metadata.exchanges, {
    onEmpty: () => [
      row(h, [
        h.td(
          [h.Colspan(100), h.Class('px-3 py-10 text-center text-sm text-muted-foreground')],
          ['No markets yet. Assign this coin to an exchange to start.'],
        ),
      ]),
    ],
    onNonEmpty: (markets) =>
      markets.map((market) =>
        h.keyed('tr')(String(market.marketId), [], [
          td(
            h,
            h.a(
              [
                h.Href(exchangeDetailUrl(market.id)),
                h.Class('inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline'),
              ],
              [
                logo({
                  src: market.logo,
                  fallback: market.name,
                  alt: market.name,
                  isDecorative: true,
                  sizeClass: 'size-6',
                  h,
                }),
                h.span([], [market.name]),
              ],
            ),
          ),
          td(h, market.symbol, { isMuted: true }),
          td(h, badge(market.listed ? 'listed' : 'delisted', h, market.listed ? 'positive' : 'neutral')),
          td(h, badge(market.tradeEnabled ? 'trading' : 'disabled', h, market.tradeEnabled ? 'info' : 'neutral')),
          td(h, chainBadges(market.chains, h)),
          td(
            h,
            h.div([h.Class('flex items-center justify-end gap-1')], [
              iconAction({
                label: `Manage chains for ${market.name}`,
                icon: icon('chain', h, 'size-3.5'),
                onClick: Message.ClickedManageLinks({
                  marketId: market.marketId,
                  exchangeId: market.id,
                  name: market.name,
                  symbol: market.symbol,
                }),
                h,
              }),
              iconAction({
                label: `Edit ${market.name} market`,
                icon: icon('pencil', h, 'size-3.5'),
                onClick: Message.ClickedEditMarket({
                  marketId: market.marketId,
                  exchangeId: market.id,
                  name: market.name,
                  symbol: market.symbol,
                  listed: market.listed,
                  tradeEnabled: market.tradeEnabled,
                }),
                h,
              }),
              iconAction({
                label: `Unassign ${market.name}`,
                icon: icon('trash', h, 'size-3.5'),
                onClick: Message.ClickedUnassignMarket({
                  marketId: market.marketId,
                  exchangeId: market.id,
                  name: market.name,
                  symbol: market.symbol,
                }),
                h,
              }),
            ]),
            { isNumeric: true },
          ),
        ])),
  })

const chainBadges = (
  chains: CoinMetadata['exchanges'][number]['chains'],
  h: HtmlBuilder<Message>,
): Html =>
  chains.length === 0
    ? h.span([h.Class('text-xs text-muted-foreground')], ['none'])
    : h.span([h.Class('flex flex-wrap items-center gap-1')], [
      ...chains.map((chain) => badge(chain.code.toUpperCase(), h, 'neutral', true)),
    ])

// MATRIX

const matrixSection = (
  metadata: CoinMetadata,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.section([h.Class('flex flex-col gap-3')], [
    sectionHeading({
      title: 'Transfer matrix',
      note: 'Whether value moves between every ordered pair of markets.',
      h,
    }),
    ...Option.match(AsyncData.getData(model.metadata), {
      onNone: () => [],
      onSome: () => [],
    }),
    matrixBody(metadata, h),
  ])

const matrixBody = (metadata: CoinMetadata, h: HtmlBuilder<Message>): Html => {
  const markets = metadata.exchanges

  if (markets.length < 2) {
    const needed = 2 - markets.length

    return h.div(
      [h.Class('rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground')],
      [
        needed === 1
          ? 'One more market is needed before routes can be compared.'
          : 'Assign at least two markets to see transfer routes.',
      ],
    )
  }

  return table(h, [
    head(h, [
      th('From', h),
      ...markets.map((market) => th(market.name, h)),
    ]),
    body(
      h,
      markets.map((from) =>
        h.keyed('tr')(String(from.marketId), [], [
          td(
            h,
            h.span([h.Class('inline-flex items-center gap-2 font-medium')], [
              logo({
                src: from.logo,
                fallback: from.name,
                alt: from.name,
                isDecorative: true,
                sizeClass: 'size-6',
                h,
              }),
              h.span([], [from.name]),
            ]),
          ),
          ...markets.map((to) => matrixCell(metadata, from.marketId, to.marketId, h)),
        ]),
      ),
    ),
  ])
}

const matrixCell = (
  metadata: CoinMetadata,
  fromId: number,
  toId: number,
  h: HtmlBuilder<Message>,
): Html => {
  if (fromId === toId) {
    return td(h, h.span([h.Class('text-muted-foreground')], ['—']))
  }

  const status = statusOf(metadata, fromId, toId)
  const label = statusLabel(status)
  const variant = status === 'full' ? 'positive' : status === 'none' ? 'critical' : 'warning'

  const from = metadata.exchanges.find((market) => market.marketId === fromId)
  const to = metadata.exchanges.find((market) => market.marketId === toId)

  return td(
    h,
    h.button(
      [
        h.Type('button'),
        h.OnClick(Message.ClickedRouteDetail({ fromId, toId })),
        h.AriaLabel(
          from === undefined || to === undefined
            ? `Route ${label}`
            : `Route from ${from.name} to ${to.name}: ${label}`,
        ),
        h.Class('rounded-sm underline-offset-4 hover:underline'),
      ],
      [badge(label, h, variant)],
    ),
  )
}

// ASSIGN

const assignView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.assignDialog,
    title: 'Assign market',
    description: 'Pick the exchange that lists this coin and the symbol it trades under there.',
    size: 'lg',
    confirmLabel: 'Confirm assign',
    isConfirmDisabled: !isAssignValid(model) || model.isSaving,
    onConfirm: Message.ClickedConfirmAssign(),
    toParentMessage: (message) => Message.GotAssignDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model.notice, h),
      pickerSearch({
        id: 'assign-exchange-search',
        label: 'Search exchanges',
        value: model.assignSearch,
        placeholder: 'Search exchanges',
        onInput: (value) => Message.UpdatedAssignSearch({ value }),
        h,
      }),
      exchangePicker(model, h),
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

const exchangePicker = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.assignExchanges, {
    onIdle: () => h.p([h.Class('text-xs text-muted-foreground')], ['Search for the exchange to assign.']),
    onLoading: () => h.p([h.Class('text-xs text-muted-foreground'), h.Role('status')], ['Loading exchanges…']),
    onRefreshing: (page) => exchangeOptions(page.data, model, h),
    onFailure: (detail) => h.p([h.Class('text-xs text-destructive')], [detail]),
    onStale: ({ data }) => exchangeOptions(data.data, model, h),
    onSuccess: (page) =>
      page.data.length === 0
        ? h.p([h.Class('text-xs text-muted-foreground')], ['No exchanges found. Try a shorter search.'])
        : exchangeOptions(page.data, model, h),
  })

const exchangeOptions = (
  exchanges: ReadonlyArray<{ id: number, name: string, slug: string, logo: string }>,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex max-h-44 flex-col gap-1 overflow-y-auto'), h.Role('listbox'), h.AriaLabel('Exchanges')], [
    ...exchanges.map((exchange) => {
      const isSelected = Option.match(model.assignExchange, {
        onNone: () => false,
        onSome: (picked) => picked.id === exchange.id,
      })

      return h.button(
        [
          h.Type('button'),
          h.OnClick(Message.PickedAssignExchange({ id: exchange.id, name: exchange.name, slug: exchange.slug })),
          h.Role('option'),
          h.AriaSelected(isSelected),
          h.Class(
            isSelected
              ? 'flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-left text-sm'
              : 'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted/60',
          ),
        ],
        [
          logo({
            src: exchange.logo,
            fallback: exchange.name,
            alt: exchange.name,
            isDecorative: true,
            sizeClass: 'size-6',
            h,
          }),
          h.span([h.Class('font-medium')], [exchange.name]),
          ' ',
          h.span([h.Class('text-xs text-muted-foreground')], [exchange.slug]),
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
      onSome: ({ name }) => `Edit ${name} market`,
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
      onSome: ({ name }) => `Unassign ${name}?`,
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
          onSome: ({ name, symbol }) =>
            `${name} no longer lists ${symbol}. Re-assigning restores the market without its chain links.`,
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
      onSome: ({ name }) => `Chains for ${name}`,
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

// ROUTE DETAIL

const routeDetailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.routeDialog,
    title: Option.match(model.routeDetail, {
      onNone: () => 'Route',
      onSome: ({ fromId, toId }) =>
        Option.match(AsyncData.getData(model.metadata), {
          onNone: () => 'Route',
          onSome: (metadata) => {
            const from = metadata.exchanges.find((market) => market.marketId === fromId)
            const to = metadata.exchanges.find((market) => market.marketId === toId)

            return from === undefined || to === undefined
              ? 'Route'
              : `${from.name} → ${to.name}`
          },
        }),
    }),
    toParentMessage: (message) => Message.GotRouteDialogMessage({ message }),
    content: Option.match(model.routeDetail, {
      onNone: () => h.empty,
      onSome: ({ fromId, toId }) =>
        Option.match(AsyncData.getData(model.metadata), {
          onNone: () => h.empty,
          onSome: (metadata) => {
            const status = statusOf(metadata, fromId, toId)
            const viable = viableFor(metadata, fromId, toId)
            const codes = new Map<number, string>()

            for (const market of metadata.exchanges) {
              for (const chain of market.chains) {
                codes.set(chain.id, chain.code)
              }
            }

            return h.div([h.Class('flex flex-col gap-3')], [
              h.div([h.Class('flex items-center gap-2')], [
                badge(statusLabel(status), h, status === 'full' ? 'positive' : status === 'none' ? 'critical' : 'warning'),
              ]),
              viable.length === 0
                ? h.p([h.Class('text-sm text-muted-foreground')], [
                  'No shared chain carries value in this direction. Enable withdraw on the source and deposit on the destination for the same chain.',
                ])
                : h.ul([h.Class('flex flex-col gap-1')], [
                  ...viable.map((chainId) =>
                    h.li([h.Class('flex items-center gap-2 text-sm')], [
                      badge((codes.get(chainId) ?? String(chainId)).toUpperCase(), h, 'neutral', true),
                      'carries value',
                    ])
                  ),
                ]),
            ])
          },
        }),
    }),
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
