import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { CoinStat, CoinStatPage } from '../../api'
import type { Coverage } from '../../coverage'
import { coinRoutesUrl } from '../../route'
import { badge } from '../../ui/badge'
import { formatCount, pendingCount } from '../../ui/format'
import { logo } from '../../ui/logo'
import { pageHeader, statStrip } from '../../ui/pageHeader'
import { emptyState, errorPanel, sectionHeading, staleNotice } from '../../ui/states'
import {
  body,
  head,
  loadingRows,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import { Model } from './model'

// VIEW

/**
 * The dashboard: the coverage figures, the worker health, and the two lists
 * that need an operator's attention. The figures arrive through the view
 * inputs because the rail owns them; the lists are this page's own Model.
 */
export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, viewInputs, h) =>
    h.div([h.Class('flex flex-col gap-6')], [
      pageHeader({
        title: 'Dashboard',
        h,
      }),
      coverageStrips(viewInputs.coverage, h),
      blockedView(model, h),
      thinView(model, h),
    ]),
)

type ViewInputs = Readonly<{
  coverage: AsyncData.AsyncData<Coverage, string>
}>

// STRIPS

const coverageStrips = (
  coverage: AsyncData.AsyncData<Coverage, string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    statStrip(coverageStats(coverage), h),
    statStrip(workerStats(coverage), h),
  ])

const coverageStats = (
  coverage: AsyncData.AsyncData<Coverage, string>,
) =>
  Option.match(AsyncData.getData(coverage), {
    onNone: () => [
      { label: 'Coins', value: pendingCount, hint: 'in the catalogue', href: '/coins' },
      { label: 'Exchanges', value: pendingCount, hint: 'registered venues', href: '/exchanges' },
      { label: 'Chains', value: pendingCount, hint: 'networks in use', href: '/chains' },
      { label: 'Markets', value: pendingCount, hint: 'coin and exchange assignments', href: '/coins' },
    ],
    onSome: (figures) => [
      { label: 'Coins', value: formatCount(figures.coins), hint: 'in the catalogue', href: '/coins' },
      { label: 'Exchanges', value: formatCount(figures.exchanges), hint: 'registered venues', href: '/exchanges' },
      { label: 'Chains', value: formatCount(figures.chains), hint: 'networks in use', href: '/chains' },
      { label: 'Markets', value: formatCount(figures.markets), hint: 'coin and exchange assignments', href: '/coins' },
    ],
  })

const workerStats = (
  coverage: AsyncData.AsyncData<Coverage, string>,
) =>
  Option.match(AsyncData.getData(coverage), {
    onNone: () => [
      { label: 'Workers running', value: pendingCount, hint: 'desired state is reconciled automatically', href: '/workers' },
      { label: 'Reconnecting shards', value: pendingCount, hint: 'retrying their exchange connection', href: '/workers' },
    ],
    onSome: (figures) => [
      {
        label: 'Workers running',
        value: `${formatCount(figures.runningWorkers)}/${formatCount(figures.totalWorkers)}`,
        hint: 'desired state is reconciled automatically',
        href: '/workers',
      },
      {
        label: 'Reconnecting shards',
        value: formatCount(figures.reconnectingShards),
        hint: 'retrying their exchange connection',
        href: '/workers',
      },
    ],
  })

// BLOCKED

const blockedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section([h.Class('flex flex-col gap-3')], [
    sectionHeading({
      title: 'Blocked routes',
      note: 'Ordered market pairs with no route in either direction.',
      h,
    }),
    AsyncData.match(model.blocked, {
      onIdle: () => blockedTable(loadingRows(h), h),
      onLoading: () => blockedTable(loadingRows(h), h),
      onRefreshing: (page) => blockedTable(blockedRows(page, h), h),
      onFailure: (detail) =>
        errorPanel({
          title: 'Could not load blocked routes',
          detail,
          onRetry: Message.ClickedRetryBlocked(),
          h,
        }),
      onStale: ({ data, error }) =>
        h.div([h.Class('flex flex-col gap-3')], [
          blockedTable(blockedRows(data, h), h),
          staleNotice({ detail: error, onRetry: Message.ClickedRetryBlocked(), h }),
        ]),
      onSuccess: (page) =>
        Array.match(page.data, {
          onEmpty: () =>
            emptyState({
              title: 'No blocked routes',
              description:
                'Every ordered market pair has a transfer route in at least one direction.',
              h,
            }),
          onNonEmpty: () => blockedTable(blockedRows(page, h), h),
        }),
    }),
  ])

const blockedTable = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [
      th('Coin', h),
      th('Markets', h, true),
      th('Chains', h, true),
      th('Blocked', h, true),
    ]),
    body(h, rows),
  ])

const blockedRows = (page: CoinStatPage, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  page.data.map((coin) =>
    h.keyed('tr')(String(coin.id), [], [
      td(
        h,
        h.a(
          [
            h.Href(coinRoutesUrl(coin.id)),
            h.Class('inline-flex items-center gap-2 font-medium uppercase underline-offset-4 hover:underline'),
          ],
          [
            logo({
              src: coin.logo,
              fallback: coin.symbol,
              alt: coin.symbol,
              isDecorative: true,
              sizeClass: 'size-6',
              h,
            }),
            h.span([], [coin.symbol]),
          ],
        ),
      ),
      td(h, marketsCell(coin, h), { isNumeric: true }),
      td(h, formatCount(coin.chains), { isNumeric: true }),
      td(h, blockedCell(coin, h), { isNumeric: true }),
    ]))

// THIN

const thinView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section([h.Class('flex flex-col gap-3')], [
    sectionHeading({
      title: 'Thin coverage',
      note: 'Coins on a single market, which cannot have a transfer route.',
      h,
    }),
    AsyncData.match(model.thin, {
      onIdle: () => thinTable(loadingRows(h), h),
      onLoading: () => thinTable(loadingRows(h), h),
      onRefreshing: (page) => thinTable(thinRows(page, h), h),
      onFailure: (detail) =>
        errorPanel({
          title: 'Could not load thin coverage',
          detail,
          onRetry: Message.ClickedRetryThin(),
          h,
        }),
      onStale: ({ data, error }) =>
        h.div([h.Class('flex flex-col gap-3')], [
          thinTable(thinRows(data, h), h),
          staleNotice({ detail: error, onRetry: Message.ClickedRetryThin(), h }),
        ]),
      onSuccess: (page) =>
        Array.match(page.data, {
          onEmpty: () =>
            emptyState({
              title: 'No thin coverage',
              description: 'Every coin is listed on at least two markets.',
              h,
            }),
          onNonEmpty: () => thinTable(thinRows(page, h), h),
        }),
    }),
  ])

const thinTable = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [th('Coin', h), th('Markets', h, true)]),
    body(h, rows),
  ])

const thinRows = (page: CoinStatPage, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  page.data.map((coin) =>
    h.keyed('tr')(String(coin.id), [], [
      td(
        h,
        h.a(
          [
            h.Href(coinRoutesUrl(coin.id)),
            h.Class('inline-flex items-center gap-2 font-medium uppercase underline-offset-4 hover:underline'),
          ],
          [
            logo({
              src: coin.logo,
              fallback: coin.symbol,
              alt: coin.symbol,
              isDecorative: true,
              sizeClass: 'size-6',
              h,
            }),
            h.span([], [coin.symbol]),
          ],
        ),
      ),
      td(h, marketsCell(coin, h), { isNumeric: true }),
    ]))

// CELLS

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
