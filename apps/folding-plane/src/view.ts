import { Array, Match, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { Nav, Tooltip } from '@foldkit/ui'

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
import { ThemeMenu, themeItems } from './themeMenu'
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
      sectionsNav(
        model.route,
        h,
        'flex gap-1 overflow-x-auto border-b border-sidebar-border px-2 py-1.5 md:hidden',
        mobileLinkClass,
      ),
      h.main([h.Class('min-w-0 flex-1')], [
        h.div(
          [
            h.Class(
              classNames(
                'mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 lg:px-8',
                model.hasNavigated && 'page-enter',
              ),
            ),
          ],
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
      sectionsNav(
        model.route,
        h,
        'flex flex-1 flex-col gap-0.5 p-2',
        railLinkClass,
      ),
      coverageView(model, h),
    ],
  )

const findSection = (label: string): Option.Option<NavItem> =>
  Array.findFirst(navItems, (item) => item.label === label)

/**
 * The section navigation, in the rail and on small screens. `Nav` marks the
 * current destination from the URL, so both renderings agree about where the
 * operator is.
 */
const sectionsNav = (
  route: AppRoute,
  h: HtmlBuilder<Message>,
  containerClass: string,
  linkClass: (isCurrent: boolean) => string,
): Html =>
  Nav.view({
    items: navItems.map((item) => item.label),
    ariaLabel: 'Sections',
    toHref: (label) => sectionHref(label),
    isItemCurrent: (label) => sectionIsCurrent(route, label),
    toView: ({ nav, items }) =>
      h.nav([...nav, h.Class(containerClass)], items.map((item) => sectionLink(item, h, linkClass))),
  })

const sectionHref = (label: string): string =>
  Option.match(findSection(label), {
    onNone: () => dashboardRouter(),
    onSome: (item) => item.href(),
  })

const sectionIsCurrent = (route: AppRoute, label: string): boolean =>
  Option.match(findSection(label), {
    onNone: () => false,
    onSome: (item) => item.isCurrent(route),
  })

const railLinkClass = (isCurrent: boolean): string =>
  classNames(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96]',
    isCurrent
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
  )

const mobileLinkClass = (isCurrent: boolean): string =>
  classNames(
    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96]',
    isCurrent
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
  )

const sectionLink = (
  item: Nav.ItemInfo<string>,
  h: HtmlBuilder<Message>,
  linkClass: (isCurrent: boolean) => string,
): Html =>
  Option.match(findSection(item.value), {
    onNone: () => h.empty,
    onSome: (section) =>
      h.keyed('a')(item.value, [
        ...item.link,
        h.Class(linkClass(item.isCurrent)),
      ], [icon(section.mark, h, 'size-4', item.isCurrent), item.value]),
  })

// COVERAGE

const themeButtonClass =
  'rounded-md px-2 py-1 text-xs text-muted-foreground transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:text-foreground'

const themeItemsClass =
  'z-10 w-36 overflow-hidden rounded-xl bg-popover p-1 shadow-[var(--shadow-border)] outline-none'

const themeItemClass =
  'cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-popover-foreground data-[active]:bg-muted'

const retryButtonClass =
  'inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:text-foreground'

const tooltipPanelClass =
  'rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-border)]'

/**
 * The theme toggle. A `Menu` names its options, so the control reads as the
 * choice it is rather than carrying its meaning in a label alone.
 */
const themeMenuView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.themeMenu.id,
    model: model.themeMenu,
    view: ThemeMenu.view,
    viewInputs: {
      items: themeItems,
      itemToConfig: (item) => ({
        content: h.span([], [item]),
        className: themeItemClass,
      }),
      buttonContent: h.span([], [model.theme]),
      buttonClassName: themeButtonClass,
      itemsClassName: themeItemsClass,
      ariaLabel: 'Change theme',
      anchor: { placement: 'bottom-end', gap: 4, padding: 8 },
    },
    toParentMessage: (message) => Message.GotThemeMenuMessage({ message }),
  })

/**
 * The retry for a coverage read that failed. A `Tooltip` names it on hover
 * and on focus; per-row controls keep an accessible name and a native tooltip
 * instead, which is the right weight for a control that repeats its row.
 */
const coverageRetryView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.coverageTooltip.id,
    model: model.coverageTooltip,
    view: Tooltip.view,
    viewInputs: {
      anchor: { placement: 'top', gap: 6, padding: 8 },
      toView: ({ trigger, panel, isVisible }) =>
        h.div([h.Class('relative inline-block')], [
          h.button(
            [
              ...trigger,
              h.Type('button'),
              h.OnClick(Message.ClickedRefreshCoverage()),
              h.AriaLabel('Retry coverage'),
              h.Class(retryButtonClass),
            ],
            [icon('refresh', h, 'size-3.5')],
          ),
          ...(isVisible
            ? [
              h.div(
                [...panel, h.Class(tooltipPanelClass)],
                ['Reload the coverage figures'],
              ),
            ]
            : []),
        ]),
    },
    toParentMessage: (message) => Message.GotCoverageTooltipMessage({ message }),
  })

const coverageControls = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(AsyncData.getError(model.coverage), {
    onNone: () => [themeMenuView(model, h)],
    onSome: () => [coverageRetryView(model, h), themeMenuView(model, h)],
  })

const coverageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('border-t border-sidebar-border px-4 py-3')],
    [
      h.div(
        [h.Class('flex items-center justify-between')],
        [
          h.p([h.Class('text-xs font-medium text-sidebar-foreground')], ['Coverage']),
          h.div([h.Class('flex items-center gap-1')], coverageControls(model, h)),
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
          h.Class('rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'),
        ],
        ['Back to the dashboard'],
      ),
    ],
  )
