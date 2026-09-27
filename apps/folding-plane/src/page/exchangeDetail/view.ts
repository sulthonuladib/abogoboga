import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinPage, MarketAssignment } from '../../api'
import { coinRoutesUrl } from '../../route'
import { badge } from '../../ui/badge'
import { formatCount, pendingCount } from '../../ui/format'
import { pageHeader, statStrip } from '../../ui/pageHeader'
import { emptyState, errorPanel } from '../../ui/states'
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
import { identityDescription, isMissing, Model } from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    headerView(model, h),
    bodyView(model, h),
  ]))

// HEADER

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.exchange), {
    onNone: () =>
      pageHeader({
        title: 'Exchange',
        description: AsyncData.isFailure(model.exchange)
          ? 'This exchange could not be loaded.'
          : 'Loading exchange.',
        back: { href: '/exchanges', label: 'Exchanges' },
        h,
      }),
    onSome: (exchange) =>
      pageHeader({
        title: exchange.name,
        description: identityDescription(exchange),
        back: { href: '/exchanges', label: 'Exchanges' },
        h,
      }),
  })

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
          h.Href('/exchanges'),
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
    onRefreshing: (rows) => marketsTableView(marketRows(rows, model, h), h),
    onFailure: () => marketsTableView(loadingRows(h), h),
    onStale: ({ data }) => marketsTableView(marketRows(data, model, h), h),
    onSuccess: (rows) =>
      Array.match(rows, {
        onEmpty: () =>
          emptyState({
            title: 'No markets yet',
            description:
              'Assign a coin to this exchange from the coin routes page, then its markets appear here.',
            action: h.a(
              [
                h.Href('/coins'),
                h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
              ],
              ['Browse coins'],
            ),
            h,
          }),
        onNonEmpty: () => marketsTableView(marketRows(rows, model, h), h),
      }),
  })

const marketsTableView = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [th('Coin', h), th('Exchange symbol', h), th('Listed', h), th('Trade enabled', h)]),
    body(h, rows),
  ])

const marketRows = (
  rows: ReadonlyArray<MarketAssignment>,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const coins = AsyncData.getData(model.coins)
  const coinsById = Option.match(coins, {
    onNone: () => new Map<number, CoinPage['data'][number]>(),
    onSome: (page) => new Map(page.data.map((coin) => [coin.id, coin] as const)),
  })
  const isIndexLoaded = Option.isSome(coins)

  return rows.map((market) =>
    h.keyed('tr')(String(market.id), [], [
      td(h, coinCell(market, coinsById, isIndexLoaded, h)),
      td(h, market.exchangeSymbol),
      td(h, badge(market.listed ? 'listed' : 'not listed', h, market.listed ? 'positive' : 'neutral')),
      td(h, badge(market.tradeEnabled ? 'enabled' : 'disabled', h, market.tradeEnabled ? 'positive' : 'neutral')),
    ]))
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
