import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { ChainLink, CoinPage, MarketAssignment } from '../../api'
import { chainsUrl, coinRoutesUrl, coinsUrl, defaultChainsQuery, defaultCoinsQuery } from '../../route'
import { badge } from '../../ui/badge'
import { formatCount, pendingCount } from '../../ui/format'
import { pageHeader, statStrip } from '../../ui/pageHeader'
import { emptyState, errorPanel } from '../../ui/states'
import {
  body,
  head,
  loadingRows,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import { Model, isMissing } from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    headerView(model, h),
    bodyView(model, h),
  ]))

// HEADER

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.chain), {
    onNone: () =>
      pageHeader({
        title: 'Chain',
        description: AsyncData.isFailure(model.chain)
          ? 'This chain could not be loaded.'
          : 'Loading chain.',
        back: { href: chainsUrl(defaultChainsQuery), label: 'Chains' },
        h,
      }),
    onSome: (chain) =>
      pageHeader({
        title: `${chain.code} ${chain.name}`,
        description: 'Every market route that settles on this chain, with its deposit and withdraw flags.',
        back: { href: chainsUrl(defaultChainsQuery), label: 'Chains' },
        h,
      }),
  })

// BODY

const bodyView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const chainError = AsyncData.getError(model.chain)

  if (Option.isSome(chainError) && isMissing(chainError.value)) {
    return emptyState({
      title: 'Chain not found',
      description:
        'This chain no longer exists. It may have been removed from the chains page.',
      action: h.a(
        [
          h.Href(chainsUrl(defaultChainsQuery)),
          h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
        ],
        ['Back to chains'],
      ),
      h,
    })
  }

  const failure = firstFailure(model)

  if (Option.isSome(failure)) {
    return errorPanel({
      title: 'Could not load chain',
      detail: failure.value,
      onRetry: Message.ClickedRetry(),
      h,
    })
  }

  return h.div([h.Class('flex flex-col gap-6')], [
    statsView(model, h),
    linksView(model, h),
  ])
}

const firstFailure = (model: Model): Option.Option<string> =>
  Option.match(AsyncData.getError(model.chain), {
    onNone: () =>
      Option.match(AsyncData.getError(model.links), {
        onNone: () =>
          Option.match(AsyncData.getError(model.markets), {
            onNone: () => AsyncData.getError(model.coins),
            onSome: (detail) => Option.some(detail),
          }),
        onSome: (detail) => Option.some(detail),
      }),
    onSome: (detail) => Option.some(detail),
  })

// STATS

const summarize = (
  links: ReadonlyArray<ChainLink>,
  markets: ReadonlyArray<MarketAssignment>,
): { exchanges: number, coins: number } => {
  const byMarket = new Map(markets.map((market) => [market.id, market] as const))
  const exchangeIds = new Set<number>()
  const coinIds = new Set<number>()

  for (const link of links) {
    const market = byMarket.get(link.exchangeCryptocurrencyId)

    if (market === undefined) {
      continue
    }

    exchangeIds.add(market.exchangeId)
    coinIds.add(market.cryptocurrencyId)
  }

  return { exchanges: exchangeIds.size, coins: coinIds.size }
}

const statsView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const links = AsyncData.getData(model.links)
  const markets = AsyncData.getData(model.markets)

  return statStrip(
    Option.match(links, {
      onNone: () => [
        { label: 'Markets', value: pendingCount, hint: 'assignments on this chain' },
        { label: 'Exchanges', value: pendingCount, hint: 'distinct exchanges' },
        { label: 'Coins', value: pendingCount, hint: 'distinct coins' },
      ],
      onSome: (rows) =>
        Option.match(markets, {
          onNone: () => [
            { label: 'Markets', value: formatCount(rows.length), hint: 'assignments on this chain' },
            { label: 'Exchanges', value: pendingCount, hint: 'distinct exchanges' },
            { label: 'Coins', value: pendingCount, hint: 'distinct coins' },
          ],
          onSome: (index) => {
            const summary = summarize(rows, index)

            return [
              { label: 'Markets', value: formatCount(rows.length), hint: 'assignments on this chain' },
              { label: 'Exchanges', value: formatCount(summary.exchanges), hint: 'distinct exchanges' },
              { label: 'Coins', value: formatCount(summary.coins), hint: 'distinct coins' },
            ]
          },
        }),
    }),
    h,
  )
}

// LINKS

const linksView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.links, {
    onIdle: () => linksTableView(loadingRows(h), h),
    onLoading: () => linksTableView(loadingRows(h), h),
    onRefreshing: (rows) => linksTableView(linkRows(rows, model, h), h),
    onFailure: () => linksTableView(loadingRows(h), h),
    onStale: ({ data }) => linksTableView(linkRows(data, model, h), h),
    onSuccess: (rows) => {
      const resolved = linkRows(rows, model, h)

      return Array.match(rows, {
        onEmpty: () =>
          emptyState({
            title: 'No markets on this chain',
            description: 'Link a market to this chain from a coin\'s routes page.',
            action: h.a(
              [
                h.Href(coinsUrl(defaultCoinsQuery)),
                h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
              ],
              ['Browse coins'],
            ),
            h,
          }),
        onNonEmpty: () =>
          resolved.length === 0
            ? emptyState({
              title: 'No markets on this chain',
              description: 'Link a market to this chain from a coin\'s routes page.',
              action: h.a(
                [
                  h.Href(coinsUrl(defaultCoinsQuery)),
                  h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
                ],
                ['Browse coins'],
              ),
              h,
            })
            : linksTableView(resolved, h),
      })
    },
  })

const linksTableView = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [th('Market', h), th('Exchange chain code', h), th('Withdraw', h), th('Deposit', h)]),
    body(h, rows),
  ])

/**
 * One row per link whose market resolves through the shared index. A link
 * with an unresolvable market is skipped rather than shown blank.
 */
const linkRows = (
  links: ReadonlyArray<ChainLink>,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const markets = AsyncData.getData(model.markets)
  const coins = AsyncData.getData(model.coins)
  const marketsById = Option.match(markets, {
    onNone: () => new Map<number, MarketAssignment>(),
    onSome: (index) => new Map(index.map((market) => [market.id, market] as const)),
  })
  const coinsById = Option.match(coins, {
    onNone: () => new Map<number, CoinPage['data'][number]>(),
    onSome: (page) => new Map(page.data.map((coin) => [coin.id, coin] as const)),
  })
  const isIndexLoaded = Option.isSome(markets)
  const isCoinsLoaded = Option.isSome(coins)

  const resolved: Array<Html> = []

  for (const link of links) {
    const market = marketsById.get(link.exchangeCryptocurrencyId)

    if (market === undefined) {
      if (isIndexLoaded) {
        continue
      }
    }

    resolved.push(
      h.keyed('tr')(String(link.id), [], [
        td(h, marketCell(market, coinsById, isCoinsLoaded, h)),
        td(h, link.exchangeChainCode),
        td(h, badge(link.withdrawEnabled ? 'enabled' : 'disabled', h, link.withdrawEnabled ? 'positive' : 'neutral')),
        td(h, badge(link.depositEnabled ? 'enabled' : 'disabled', h, link.depositEnabled ? 'positive' : 'neutral')),
      ]),
    )
  }

  return resolved
}

const marketCell = (
  market: MarketAssignment | undefined,
  coinsById: ReadonlyMap<number, CoinPage['data'][number]>,
  isCoinsLoaded: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  if (market === undefined) {
    return h.span([h.Class('text-muted-foreground')], ['…'])
  }

  const coin = coinsById.get(market.cryptocurrencyId)

  if (coin === undefined) {
    return h.span([h.Class('inline-flex items-baseline gap-2')], [
      h.span([h.Class('text-muted-foreground')], [
        isCoinsLoaded ? `market #${market.id}` : '…',
      ]),
      h.span([h.Class('text-xs text-muted-foreground')], [market.exchangeSymbol]),
    ])
  }

  return h.span([h.Class('inline-flex items-baseline gap-2')], [
    h.a(
      [
        h.Href(coinRoutesUrl(coin.id)),
        h.Class('font-medium uppercase underline-offset-4 hover:underline'),
      ],
      [coin.symbol],
    ),
    h.span([h.Class('text-xs text-muted-foreground')], [market.exchangeSymbol]),
  ])
}
