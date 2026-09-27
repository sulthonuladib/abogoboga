import { Match, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'

import { Message } from './message'
import { type Coverage, type Model } from './model'
import * as Chains from './page/chains'
import {
  AppRoute,
  chainsUrl,
  coinsUrl,
  dashboardRouter,
  exchangesUrl,
} from './route'
import { formatCount, pendingCount } from './ui/format'
import { icon } from './ui/icon'
import { classNames } from './ui/classNames'

// NAVIGATION

type NavItem = Readonly<{
  label: string
  href: () => string
  mark: 'gauge' | 'coin' | 'exchange' | 'chain' | 'pulse'
  isCurrent: (route: AppRoute) => boolean
}>

const navItems: ReadonlyArray<NavItem> = [
  {
    label: 'Dashboard',
    href: dashboardRouter,
    mark: 'gauge',
    isCurrent: (route) => route._tag === 'Dashboard',
  },
  {
    label: 'Coins',
    href: () => coinsUrl({ search: '', flag: 'all', sort: 'symbol', order: 'asc', page: 1 }),
    mark: 'coin',
    isCurrent: (route) => route._tag === 'Coins' || route._tag === 'CoinRoutes',
  },
  {
    label: 'Exchanges',
    href: () => exchangesUrl({ search: '', sort: 'name', order: 'asc', page: 1 }),
    mark: 'exchange',
    isCurrent: (route) => route._tag === 'Exchanges' || route._tag === 'ExchangeDetail',
  },
  {
    label: 'Chains',
    href: () => chainsUrl({ search: '', sort: 'name', order: 'asc', page: 1 }),
    mark: 'chain',
    isCurrent: (route) => route._tag === 'Chains' || route._tag === 'ChainDetail',
  },
  {
    label: 'Workers',
    href: () => '/workers',
    mark: 'pulse',
    isCurrent: (route) => route._tag === 'Workers',
  },
]

// VIEW

const title = (route: AppRoute): string =>
  AppRoute.match<string>(route, {
    Dashboard: () => 'Lister control plane',
    Coins: () => 'Coins | Lister control plane',
    CoinRoutes: () => 'Coin routes | Lister control plane',
    Exchanges: () => 'Exchanges | Lister control plane',
    ExchangeDetail: () => 'Exchange | Lister control plane',
    Chains: () => 'Chains | Lister control plane',
    ChainDetail: () => 'Chain | Lister control plane',
    Workers: () => 'Workers | Lister control plane',
    NotFound: () => 'Not found | Lister control plane',
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: title(model.route),
  body: h.div(
    [
      h.DataAttribute('theme', model.theme),
      h.Class('min-h-dvh bg-background text-foreground'),
    ],
    [
      shellView(model, h),
    ],
  ),
})

// SHELL

const shellView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex min-h-dvh flex-col md:flex-row')], [
    railView(model, h),
    h.div([h.Class('flex min-w-0 flex-1 flex-col')], [
      h.nav(
        [h.Class('flex gap-1 overflow-x-auto border-b border-sidebar-border px-2 py-1.5 md:hidden')],
        navItems.map((item) => navLink(item, model.route, h)),
      ),
      h.main([h.Class('min-w-0 flex-1')], [
        h.div(
          [h.Class('mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 lg:px-8')],
          [routeView(model, h)],
        ),
      ]),
    ]),
  ])

const railView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [h.Class('hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex')],
    [
      h.div(
        [h.Class('flex h-14 items-center gap-2 border-b border-sidebar-border px-4')],
        [
          h.span([h.Class('text-primary')], [icon('chart', h, 'size-5')]),
          h.span([h.Class('text-base font-semibold tracking-tight')], ['Lister']),
          h.span([h.Class('text-xs text-muted-foreground')], ['control plane']),
        ],
      ),
      h.nav(
        [h.Class('flex flex-1 flex-col gap-0.5 p-2'), h.AriaLabel('Sections')],
        navItems.map((item) => navLink(item, model.route, h)),
      ),
      coverageView(model, h),
    ],
  )

const navLink = (item: NavItem, route: AppRoute, h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href(item.href()),
      h.AriaCurrent(item.isCurrent(route) ? 'page' : 'false'),
      h.Class(
        classNames(
          'flex items-center gap-2.5 rounded-3xl px-3 py-2 text-sm whitespace-nowrap transition-colors',
          item.isCurrent(route)
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        ),
      ),
    ],
    [icon(item.mark, h), item.label],
  )

// COVERAGE

const coverageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('border-t border-sidebar-border px-4 py-3')],
    [
      h.div(
        [h.Class('flex items-center justify-between')],
        [
          h.p([h.Class('text-xs font-medium text-sidebar-foreground')], ['Coverage']),
          h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ClickedToggleTheme()),
              h.AriaLabel(
                model.theme === 'Light' ? 'Switch to dark theme' : 'Switch to light theme',
              ),
              h.Title(
                model.theme === 'Light' ? 'Switch to dark theme' : 'Switch to light theme',
              ),
              h.Class('rounded-md p-1 text-muted-foreground hover:bg-muted'),
            ],
            [model.theme === 'Light' ? '◐' : '◑'],
          ),
        ],
      ),
      h.dl([h.Class('mt-2 flex flex-col gap-1.5 text-xs')], coverageRows(model, h)),
    ],
  )

const coverageRows = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(AsyncData.getData(model.coverage), {
    onNone: () => [coverageRow('Coins', pendingCount, h)],
    onSome: (coverage) => [
      coverageRow('Coins', formatCount(coverage.coins), h),
      coverageRow('Exchanges', formatCount(coverage.exchanges), h),
      coverageRow('Chains', formatCount(coverage.chains), h),
      coverageRow('Markets', formatCount(coverage.markets), h),
      coverageRow(
        'Workers running',
        `${formatCount(coverage.runningWorkers)}/${formatCount(coverage.totalWorkers)}`,
        h,
      ),
      coverageRow('Reconnecting', formatCount(coverage.reconnectingShards), h),
    ],
  })

const coverageRow = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex items-baseline justify-between gap-2')],
    [
      h.dt([h.Class('text-muted-foreground')], [label]),
      h.dd([h.Class('tabular-nums')], [value]),
    ],
  )

// ROUTE

const routeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AppRoute.match<Html>(model.route, {
    Dashboard: () => placeholderView('Dashboard', h),
    Coins: () => placeholderView('Coins', h),
    CoinRoutes: () => placeholderView('Coin routes', h),
    Exchanges: () => placeholderView('Exchanges', h),
    ExchangeDetail: () => placeholderView('Exchange', h),
    Chains: () =>
      h.submodel({
        slotId: 'chains',
        model: model.chains,
        view: Chains.view,
        toParentMessage: (message) => Message.GotChainsMessage({ message }),
      }),
    ChainDetail: () => placeholderView('Chain', h),
    Workers: () => placeholderView('Workers', h),
    NotFound: ({ path }) => notFoundView(path, h),
  })

const placeholderView = (title: string, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('flex flex-col gap-2')],
    [
      h.h1([h.Class('text-xl font-semibold tracking-tight')], [title]),
      h.p([h.Class('text-sm text-muted-foreground')], ['Coming next.']),
    ],
  )

const notFoundView = (path: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('mx-auto flex max-w-xl flex-col items-center gap-3 py-20 text-center')],
    [
      h.h1([h.Class('text-xl font-semibold')], ['Nothing here']),
      h.p([h.Class('text-sm text-muted-foreground')], [
        `No page answers to ${path}.`,
      ]),
      h.a(
        [
          h.Href(dashboardRouter()),
          h.Class('rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted'),
        ],
        ['Back to the dashboard'],
      ),
    ],
  )
