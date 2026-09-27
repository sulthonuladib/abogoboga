import { Effect, Match, Option, Schema } from 'effect'
import { AsyncData, Command, Runtime, Update } from 'foldkit'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'
import { Menu, Tooltip } from '@foldkit/ui'

import { call, isApiFailure } from './api'
import { readCoverage } from './coverage'
import type { Flags } from './flags'
import { Message } from './message'
import type { Model, Theme } from './model'
import * as Chains from './page/chains'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'
import { AppRoute, chainsQueryFromRoute, exchangesQueryFromRoute, urlToAppRoute } from './route'
import { THEME_COOKIE } from './theme'
import { ThemeMenu } from './themeMenu'

type UpdateReturn = Update.Return<Model, Message>

/**
 * Why a request to the control plane did not produce data, in the words the
 * page shows.
 */
const detailOf = (error: unknown): string =>
  isApiFailure(error) ? error.detail : 'the control plane could not be read'

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) =>
    pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

const PersistTheme = Command.define('PersistTheme', {
  args: { theme: Schema.Literals(['Light', 'Dark']) },
  messages: [Message.CompletedPersistTheme],
  execute: ({ theme }) =>
    Effect.try(() => {
      document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000`

      // A theme flip recolors nearly every element at once. Suppress
      // transitions for one frame so the switch snaps instead of smearing,
      // then restore them before the next interaction.
      const style = document.createElement('style')
      style.append(
        document.createTextNode('*,*::before,*::after{transition:none !important}'),
      )
      document.head.append(style)

      const _flushReflow = document.body.offsetHeight

      requestAnimationFrame(() => {
        requestAnimationFrame(() => style.remove())
      })
    }).pipe(
      Effect.as(Message.CompletedPersistTheme()),
      Effect.catch(() => Effect.succeed(Message.CompletedPersistTheme())),
    ),
})

export const FetchCoverage = Command.define('FetchCoverage', {
  messages: [Message.SettledFetchCoverage],
  execute: call(readCoverage).pipe(
    Effect.mapError((error) => detailOf(error)),
    Effect.result,
    Effect.map((result) => Message.SettledFetchCoverage({ result })),
  ),
})

// STEP

/**
 * Reload the rail's figures, keeping the current ones on screen while they are
 * replaced. A refresh while one is already in flight does nothing.
 */
const refreshCoverage: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.coverage), {
    onNone: () => ({ model }),
    onSome: (coverage) => ({
      model: modifyFields(model, { coverage: () => coverage }),
      commands: [FetchCoverage()],
    }),
  })

// FOLD

const keepModel: Update.Step<Model, Message> = (model) => ({ model })

const foldThemeMenuOutMessage = Menu.OutMessage.match<
  Update.Step<Model, Message>,
  Menu.OutMessage<Theme>
>({
  Selected: ({ value }) => (model) => ({
    model: modifyFields(model, { theme: () => value }),
    commands: [PersistTheme({ theme: value })],
  }),
})

const foldThemeMenu = Update.foldChild({
  update: ThemeMenu.update,
  read: (model: Model) => Option.some(model.themeMenu),
  write: (model, nextThemeMenu) =>
    modifyFields(model, { themeMenu: () => nextThemeMenu }),
  toParentMessage: (message) => Message.GotThemeMenuMessage({ message }),
  foldOutMessage: foldThemeMenuOutMessage,
})

const foldCoverageTooltipOutMessage = Tooltip.OutMessage.match<
  Update.Step<Model, Message>
>({
  Shown: () => keepModel,
  Hidden: () => keepModel,
})

const foldCoverageTooltip = Update.foldChild({
  update: Tooltip.update,
  read: (model: Model) => Option.some(model.coverageTooltip),
  write: (model, nextCoverageTooltip) =>
    modifyFields(model, { coverageTooltip: () => nextCoverageTooltip }),
  toParentMessage: (message) => Message.GotCoverageTooltipMessage({ message }),
  foldOutMessage: foldCoverageTooltipOutMessage,
})

const foldChainsOutMessage = Chains.OutMessage.match<Update.Step<Model, Message>>({
  ChangedCatalogue: () => refreshCoverage,
})

const foldChains = Update.foldChild({
  update: Chains.update,
  read: (model: Model) => Option.some(model.chains),
  write: (model, nextChains) => modifyFields(model, { chains: () => nextChains }),
  toParentMessage: (message) => Message.GotChainsMessage({ message }),
  foldOutMessage: foldChainsOutMessage,
})

const foldChainsRouteChanged = Update.foldChild({
  update: Chains.informRouteChanged,
  read: (model: Model) => Option.some(model.chains),
  write: (model, nextChains) => modifyFields(model, { chains: () => nextChains }),
  toParentMessage: (message) => Message.GotChainsMessage({ message }),
})

const foldExchangesOutMessage = Exchanges.OutMessage.match<Update.Step<Model, Message>>({
  ChangedCatalogue: () => refreshCoverage,
})

const foldExchanges = Update.foldChild({
  update: Exchanges.update,
  read: (model: Model) => Option.some(model.exchanges),
  write: (model, nextExchanges) => modifyFields(model, { exchanges: () => nextExchanges }),
  toParentMessage: (message) => Message.GotExchangesMessage({ message }),
  foldOutMessage: foldExchangesOutMessage,
})

const foldExchangesRouteChanged = Update.foldChild({
  update: Exchanges.informRouteChanged,
  read: (model: Model) => Option.some(model.exchanges),
  write: (model, nextExchanges) => modifyFields(model, { exchanges: () => nextExchanges }),
  toParentMessage: (message) => Message.GotExchangesMessage({ message }),
})

const foldExchangeDetail = Update.foldChild({
  update: ExchangeDetail.update,
  read: (model: Model) => Option.some(model.exchangeDetail),
  write: (model, nextExchangeDetail) =>
    modifyFields(model, { exchangeDetail: () => nextExchangeDetail }),
  toParentMessage: (message) => Message.GotExchangeDetailMessage({ message }),
})

const foldExchangeDetailRouteChanged = Update.foldChild({
  update: ExchangeDetail.showExchange,
  read: (model: Model) => Option.some(model.exchangeDetail),
  write: (model, nextExchangeDetail) =>
    modifyFields(model, { exchangeDetail: () => nextExchangeDetail }),
  toParentMessage: (message) => Message.GotExchangeDetailMessage({ message }),
})

const foldDashboard = Update.foldChild({
  update: Dashboard.update,
  read: (model: Model) => Option.some(model.dashboard),
  write: (model, nextDashboard) => modifyFields(model, { dashboard: () => nextDashboard }),
  toParentMessage: (message) => Message.GotDashboardMessage({ message }),
})

const enteredDashboard = Update.foldChildStep({
  update: Dashboard.entered,
  read: (model: Model) => Option.some(model.dashboard),
  write: (model, nextDashboard) => modifyFields(model, { dashboard: () => nextDashboard }),
  toParentMessage: (message) => Message.GotDashboardMessage({ message }),
})

// ROUTE

const setRoute =
  (nextRoute: AppRoute): Update.Step<Model, Message> =>
  (model) => ({ model: modifyFields(model, { route: () => nextRoute, hasNavigated: () => true }) })

/**
 * The steps a route change runs: the new route first, then the page it belongs
 * to. A page hears about a route only when the URL names it, so navigating away
 * from a listing does not refetch it.
 */
const pageSteps = (route: AppRoute): ReadonlyArray<Update.Step<Model, Message>> =>
  Match.value(route).pipe(
    Match.tag('Dashboard', () => [enteredDashboard]),
    Match.tag('Chains', (chainsRoute) => [
      foldChainsRouteChanged(chainsQueryFromRoute(chainsRoute)),
    ]),
    Match.tag('Exchanges', (exchangesRoute) => [
      foldExchangesRouteChanged(exchangesQueryFromRoute(exchangesRoute)),
    ]),
    Match.tag('ExchangeDetail', ({ exchangeId }) => [
      foldExchangeDetailRouteChanged(exchangeId),
    ]),
    Match.orElse(() => []),
  )

// INIT

/**
 * The application as it opens. The server's Flags carry the rendered page's
 * rows, so a cold load fetches nothing twice.
 */
export const init: Runtime.RoutingApplicationInit<Model, Message, Flags> = (
  flags,
  url,
): Update.Return<Model, Message> => {
  const route = urlToAppRoute(url)
  const base = {
    route,
    theme: flags.theme,
    themeMenu: Menu.init({ id: 'theme-menu' }),
    coverage: flags.coverage,
    coverageTooltip: Tooltip.init({ id: 'coverage-tooltip' }),
    chains: Chains.initialModel,
    dashboard: Dashboard.initialModel,
    exchanges: Exchanges.initialModel,
    exchangeDetail: ExchangeDetail.initFor(0),
    hasNavigated: false,
  }

  return Match.value(route).pipe(
    Match.tag('Dashboard', () => {
      const dashboardInit = Dashboard.init(flags.dashboard)

      return {
        model: { ...base, dashboard: dashboardInit.model },
        commands: Command.mapMessages(dashboardInit.commands, (message) =>
          Message.GotDashboardMessage({ message })),
      }
    }),
    Match.tag('Chains', (chainsRoute) => {
      const chainsInit = Chains.init(
        chainsQueryFromRoute(chainsRoute),
        flags.chains,
      )

      return {
        model: { ...base, chains: chainsInit.model },
        commands: Command.mapMessages(chainsInit.commands, (message) =>
          Message.GotChainsMessage({ message })),
      }
    }),
    Match.tag('Exchanges', (exchangesRoute) => {
      const exchangesInit = Exchanges.init(
        exchangesQueryFromRoute(exchangesRoute),
        flags.exchanges,
      )

      return {
        model: { ...base, exchanges: exchangesInit.model },
        commands: Command.mapMessages(exchangesInit.commands, (message) =>
          Message.GotExchangesMessage({ message })),
      }
    }),
    Match.tag('ExchangeDetail', ({ exchangeId }) => {
      const exchangeDetailInit = ExchangeDetail.init(exchangeId, flags.exchangeDetail)

      return {
        model: { ...base, exchangeDetail: exchangeDetailInit.model },
        commands: Command.mapMessages(exchangeDetailInit.commands, (message) =>
          Message.GotExchangeDetailMessage({ message })),
      }
    }),
    Match.orElse(() => ({ model: base })),
  )
}

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      return Update.combine(model, [setRoute(nextRoute), ...pageSteps(nextRoute)])
    },

    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedPersistTheme: () => ({ model }),

    GotThemeMenuMessage: ({ message }) => foldThemeMenu(model, message),

    GotCoverageTooltipMessage: ({ message }) => foldCoverageTooltip(model, message),

    ClickedRefreshCoverage: () => refreshCoverage(model),

    SettledFetchCoverage: ({ result }) => ({
      model: modifyFields(model, { coverage: AsyncData.settle(result) }),
    }),

    GotChainsMessage: ({ message }) => foldChains(model, message),

    GotDashboardMessage: ({ message }) => foldDashboard(model, message),

    GotExchangesMessage: ({ message }) => foldExchanges(model, message),

    GotExchangeDetailMessage: ({ message }) => foldExchangeDetail(model, message),
  })
