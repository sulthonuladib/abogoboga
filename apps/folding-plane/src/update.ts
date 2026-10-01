import { Effect, Match, Option, Schema } from 'effect'
import { AsyncData, Command, Runtime, Update } from 'foldkit'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'
import { Menu, Tooltip } from '@foldkit/ui'

import { type SignalRow, type WorkerStatus, call, isApiFailure } from './api'
import { ConnectionState } from './connection'
import { readCoverage } from './coverage'
import type { Flags } from './flags'
import { Message } from './message'
import { type Model, Preset, type Theme } from './model'
import * as ChainDetail from './page/chainDetail'
import * as Chains from './page/chains'
import * as CoinRoutes from './page/coinRoutes'
import * as Coins from './page/coins'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'
import * as Signals from './page/signals'
import * as Workers from './page/workers'
import { AppRoute, chainsQueryFromRoute, coinsQueryFromRoute, exchangesQueryFromRoute, signalsQueryFromRoute, urlToAppRoute } from './route'
import { PRESET_COOKIE, THEME_COOKIE } from './theme'
import { PresetMenu, ThemeMenu } from './themeMenu'

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

/**
 * A recolor — theme or preset — touches nearly every element at once.
 * Suppress transitions for one frame so the switch snaps instead of
 * smearing, then restore them before the next interaction.
 */
const suppressTransitionsForOneFrame = (): void => {
  const style = document.createElement('style')
  style.append(
    document.createTextNode('*,*::before,*::after{transition:none !important}'),
  )
  document.head.append(style)

  const _flushReflow = document.body.offsetHeight

  requestAnimationFrame(() => {
    requestAnimationFrame(() => style.remove())
  })
}

export const PersistTheme = Command.define('PersistTheme', {
  args: { theme: Schema.Literals(['Light', 'Dark']) },
  messages: [Message.CompletedPersistTheme],
  execute: ({ theme }) =>
    Effect.try(() => {
      document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000`
      suppressTransitionsForOneFrame()
    }).pipe(
      Effect.as(Message.CompletedPersistTheme()),
      Effect.catch(() => Effect.succeed(Message.CompletedPersistTheme())),
    ),
})

export const PersistPreset = Command.define('PersistPreset', {
  args: { preset: Preset },
  messages: [Message.CompletedPersistPreset],
  execute: ({ preset }) =>
    Effect.try(() => {
      document.cookie = `${PRESET_COOKIE}=${preset}; path=/; max-age=31536000`
      suppressTransitionsForOneFrame()
    }).pipe(
      Effect.as(Message.CompletedPersistPreset()),
      Effect.catch(() => Effect.succeed(Message.CompletedPersistPreset())),
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

/**
 * How long to wait before trying the event socket again after a failed
 * connection, so a dev server restart or a brief network drop recovers on its
 * own instead of dead-ending in `Error`.
 */
const socketRetryDelay = '1500 millis'

/**
 * The event socket failed to open. Wait, then ask for another attempt by
 * bumping the generation the socket ManagedResource keys on. Without this the
 * app stays in `Error` until a full reload, so an open tab never reconnects
 * after the server restarts.
 */
export const RetrySocket = Command.define('RetrySocket', {
  messages: [Message.RetrySocket],
  execute: Effect.sleep(socketRetryDelay).pipe(Effect.as(Message.RetrySocket())),
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

const foldPresetMenuOutMessage = Menu.OutMessage.match<
  Update.Step<Model, Message>,
  Menu.OutMessage<Preset>
>({
  Selected: ({ value }) => (model) => ({
    model: modifyFields(model, { preset: () => value }),
    commands: [PersistPreset({ preset: value })],
  }),
})

const foldPresetMenu = Update.foldChild({
  update: PresetMenu.update,
  read: (model: Model) => Option.some(model.presetMenu),
  write: (model, nextPresetMenu) =>
    modifyFields(model, { presetMenu: () => nextPresetMenu }),
  toParentMessage: (message) => Message.GotPresetMenuMessage({ message }),
  foldOutMessage: foldPresetMenuOutMessage,
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

const foldChainDetail = Update.foldChild({
  update: ChainDetail.update,
  read: (model: Model) => Option.some(model.chainDetail),
  write: (model, nextChainDetail) =>
    modifyFields(model, { chainDetail: () => nextChainDetail }),
  toParentMessage: (message) => Message.GotChainDetailMessage({ message }),
})

const foldChainDetailRouteChanged = Update.foldChild({
  update: ChainDetail.showChain,
  read: (model: Model) => Option.some(model.chainDetail),
  write: (model, nextChainDetail) =>
    modifyFields(model, { chainDetail: () => nextChainDetail }),
  toParentMessage: (message) => Message.GotChainDetailMessage({ message }),
})

const foldCoinsOutMessage = Coins.OutMessage.match<Update.Step<Model, Message>>({
  ChangedCatalogue: () => refreshCoverage,
})

const foldCoins = Update.foldChild({
  update: Coins.update,
  read: (model: Model) => Option.some(model.coins),
  write: (model, nextCoins) => modifyFields(model, { coins: () => nextCoins }),
  toParentMessage: (message) => Message.GotCoinsMessage({ message }),
  foldOutMessage: foldCoinsOutMessage,
})

const foldCoinsRouteChanged = Update.foldChild({
  update: Coins.informRouteChanged,
  read: (model: Model) => Option.some(model.coins),
  write: (model, nextCoins) => modifyFields(model, { coins: () => nextCoins }),
  toParentMessage: (message) => Message.GotCoinsMessage({ message }),
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

const foldExchangeDetailOutMessage = ExchangeDetail.OutMessage.match<Update.Step<Model, Message>>({
  ChangedCatalogue: () => refreshCoverage,
})

const foldExchangeDetail = Update.foldChild({
  update: ExchangeDetail.update,
  read: (model: Model) => Option.some(model.exchangeDetail),
  write: (model, nextExchangeDetail) =>
    modifyFields(model, { exchangeDetail: () => nextExchangeDetail }),
  toParentMessage: (message) => Message.GotExchangeDetailMessage({ message }),
  foldOutMessage: foldExchangeDetailOutMessage,
})

const foldExchangeDetailRouteChanged = Update.foldChild({
  update: ExchangeDetail.showExchange,
  read: (model: Model) => Option.some(model.exchangeDetail),
  write: (model, nextExchangeDetail) =>
    modifyFields(model, { exchangeDetail: () => nextExchangeDetail }),
  toParentMessage: (message) => Message.GotExchangeDetailMessage({ message }),
})

const foldCoinRoutesOutMessage = CoinRoutes.OutMessage.match<Update.Step<Model, Message>>({
  ChangedCatalogue: () => refreshCoverage,
})

const foldCoinRoutes = Update.foldChild({
  update: CoinRoutes.update,
  read: (model: Model) => Option.some(model.coinRoutes),
  write: (model, nextCoinRoutes) =>
    modifyFields(model, { coinRoutes: () => nextCoinRoutes }),
  toParentMessage: (message) => Message.GotCoinRoutesMessage({ message }),
  foldOutMessage: foldCoinRoutesOutMessage,
})

const foldCoinRoutesChanged = Update.foldChild({
  update: CoinRoutes.showCoin,
  read: (model: Model) => Option.some(model.coinRoutes),
  write: (model, nextCoinRoutes) =>
    modifyFields(model, { coinRoutes: () => nextCoinRoutes }),
  toParentMessage: (message) => Message.GotCoinRoutesMessage({ message }),
})

const foldWorkersOutMessage = Workers.OutMessage.match<Update.Step<Model, Message>>({
  ChangedWorkers: () => refreshCoverage,
})

const foldWorkers = Update.foldChild({
  update: Workers.update,
  read: (model: Model) => Option.some(model.workers),
  write: (model, nextWorkers) => modifyFields(model, { workers: () => nextWorkers }),
  toParentMessage: (message) => Message.GotWorkersMessage({ message }),
  foldOutMessage: foldWorkersOutMessage,
})

const enteredWorkers = Update.foldChildStep({
  update: Workers.entered,
  read: (model: Model) => Option.some(model.workers),
  write: (model, nextWorkers) => modifyFields(model, { workers: () => nextWorkers }),
  toParentMessage: (message) => Message.GotWorkersMessage({ message }),
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

const foldSignals = Update.foldChild({
  update: Signals.update,
  read: (model: Model) => Option.some(model.signals),
  write: (model, nextSignals) => modifyFields(model, { signals: () => nextSignals }),
  toParentMessage: (message) => Message.GotSignalsMessage({ message }),
})

const enteredSignals = Update.foldChildStep({
  update: Signals.entered,
  read: (model: Model) => Option.some(model.signals),
  write: (model, nextSignals) => modifyFields(model, { signals: () => nextSignals }),
  toParentMessage: (message) => Message.GotSignalsMessage({ message }),
})

const foldSignalsRouteChanged = Update.foldChild({
  update: Signals.informRouteChanged,
  read: (model: Model) => Option.some(model.signals),
  write: (model, nextSignals) => modifyFields(model, { signals: () => nextSignals }),
  toParentMessage: (message) => Message.GotSignalsMessage({ message }),
})

/**
 * The socket and the clock drive the signal page through its own update
 * capabilities, so the root never constructs a child Message. `foldSignals`
 * carries the child's own Messages; these two carry the facts the root owns.
 */
const foldSignalsReceivedRows = (
  model: Model,
  rows: ReadonlyArray<SignalRow>,
): Update.Return<Model, Message> =>
  Update.foldChildStep({
    update: Signals.receivedSignal(rows),
    read: (parent: Model) => Option.some(parent.signals),
    write: (parent, nextSignals) => modifyFields(parent, { signals: () => nextSignals }),
    toParentMessage: (message) => Message.GotSignalsMessage({ message }),
  })(model)

const foldSignalsTicked = (
  model: Model,
  now: number,
): Update.Return<Model, Message> =>
  Update.foldChildStep({
    update: Signals.ticked(now),
    read: (parent: Model) => Option.some(parent.signals),
    write: (parent, nextSignals) => modifyFields(parent, { signals: () => nextSignals }),
    toParentMessage: (message) => Message.GotSignalsMessage({ message }),
  })(model)

/**
 * The socket delivered a worker snapshot. Like the signals fold, the root owns
 * the fact and drives the Workers child through a capability.
 */
const foldWorkersReceived = (
  model: Model,
  workers: ReadonlyArray<WorkerStatus>,
): Update.Return<Model, Message> =>
  Update.foldChildStep({
    update: Workers.receivedWorkers(workers),
    read: (parent: Model) => Option.some(parent.workers),
    write: (parent, nextWorkers) => modifyFields(parent, { workers: () => nextWorkers }),
    toParentMessage: (message) => Message.GotWorkersMessage({ message }),
  })(model)

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
    Match.tag('Coins', (coinsRoute) => [
      foldCoinsRouteChanged(coinsQueryFromRoute(coinsRoute)),
    ]),
    Match.tag('CoinRoutes', ({ coinId }) => [
      foldCoinRoutesChanged(coinId),
    ]),
    Match.tag('Chains', (chainsRoute) => [
      foldChainsRouteChanged(chainsQueryFromRoute(chainsRoute)),
    ]),
    Match.tag('ChainDetail', ({ chainId }) => [
      foldChainDetailRouteChanged(chainId),
    ]),
    Match.tag('Exchanges', (exchangesRoute) => [
      foldExchangesRouteChanged(exchangesQueryFromRoute(exchangesRoute)),
    ]),
    Match.tag('ExchangeDetail', ({ exchangeId }) => [
      foldExchangeDetailRouteChanged(exchangeId),
    ]),
    Match.tag('Workers', () => [enteredWorkers]),
    Match.tag('Signals', (signalsRoute) => [
      foldSignalsRouteChanged(signalsQueryFromRoute(signalsRoute)),
      enteredSignals,
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
    preset: flags.preset,
    presetMenu: Menu.init({ id: 'preset-menu' }),
    coverage: flags.coverage,
    coverageTooltip: Tooltip.init({ id: 'coverage-tooltip' }),
    chains: Chains.initialModel,
    chainDetail: ChainDetail.initFor(0),
    coins: Coins.initialModel,
    coinRoutes: CoinRoutes.initFor(0),
    dashboard: Dashboard.initialModel,
    exchanges: Exchanges.initialModel,
    exchangeDetail: ExchangeDetail.initFor(0),
    workers: Workers.initialModel,
    signals: Signals.initialModel,
    connection: ConnectionState.Connecting(),
    socketGeneration: 0,
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
    Match.tag('Coins', (coinsRoute) => {
      const coinsInit = Coins.init(
        coinsQueryFromRoute(coinsRoute),
        flags.coins,
      )

      return {
        model: { ...base, coins: coinsInit.model },
        commands: Command.mapMessages(coinsInit.commands, (message) =>
          Message.GotCoinsMessage({ message })),
      }
    }),
    Match.tag('ChainDetail', ({ chainId }) => {
      const chainDetailInit = ChainDetail.init(chainId, flags.chainDetail)

      return {
        model: { ...base, chainDetail: chainDetailInit.model },
        commands: Command.mapMessages(chainDetailInit.commands, (message) =>
          Message.GotChainDetailMessage({ message })),
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
    Match.tag('CoinRoutes', ({ coinId }) => {
      const coinRoutesInit = CoinRoutes.init(coinId, flags.coinRoutes)

      return {
        model: { ...base, coinRoutes: coinRoutesInit.model },
        commands: Command.mapMessages(coinRoutesInit.commands, (message) =>
          Message.GotCoinRoutesMessage({ message })),
      }
    }),
    Match.tag('Workers', () => {
      const workersInit = Workers.init(flags.workers)

      return {
        model: { ...base, workers: workersInit.model },
        commands: Command.mapMessages(workersInit.commands, (message) =>
          Message.GotWorkersMessage({ message })),
      }
    }),
    Match.tag('Signals', (signalsRoute) => {
      const signalsInit = Signals.init(signalsQueryFromRoute(signalsRoute))

      return {
        model: { ...base, signals: signalsInit.model },
        commands: Command.mapMessages(signalsInit.commands, (message) =>
          Message.GotSignalsMessage({ message })),
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
    CompletedPersistPreset: () => ({ model }),

    GotThemeMenuMessage: ({ message }) => foldThemeMenu(model, message),

    GotPresetMenuMessage: ({ message }) => foldPresetMenu(model, message),

    GotCoverageTooltipMessage: ({ message }) => foldCoverageTooltip(model, message),

    ClickedRefreshCoverage: () => refreshCoverage(model),

    SettledFetchCoverage: ({ result }) => ({
      model: modifyFields(model, { coverage: AsyncData.settle(result) }),
    }),

    GotChainsMessage: ({ message }) => foldChains(model, message),

    GotChainDetailMessage: ({ message }) => foldChainDetail(model, message),

    GotCoinsMessage: ({ message }) => foldCoins(model, message),

    GotCoinRoutesMessage: ({ message }) => foldCoinRoutes(model, message),

    GotDashboardMessage: ({ message }) => foldDashboard(model, message),

    GotExchangesMessage: ({ message }) => foldExchanges(model, message),

    GotExchangeDetailMessage: ({ message }) => foldExchangeDetail(model, message),

    GotWorkersMessage: ({ message }) => foldWorkers(model, message),

    GotSignalsMessage: ({ message }) => foldSignals(model, message),

    ReceivedSignalRows: ({ rows }) => foldSignalsReceivedRows(model, rows),

    ReceivedWorkers: ({ workers }) => foldWorkersReceived(model, workers),

    TickedSignals: ({ now }) => foldSignalsTicked(model, now),

    SocketAcquired: () => ({
      model: modifyFields(model, { connection: () => ConnectionState.Connected() }),
    }),

    SocketReleased: () => ({
      model: modifyFields(model, { connection: () => ConnectionState.Disconnected() }),
    }),

    SocketFailed: ({ detail }) => ({
      model: modifyFields(model, { connection: () => ConnectionState.Error({ detail }) }),
      commands: [RetrySocket()],
    }),

    RetrySocket: () => ({
      model: modifyFields(model, {
        socketGeneration: (generation) => generation + 1,
      }),
    }),

    SocketClosed: () => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Connecting(),
        socketGeneration: (generation) => generation + 1,
      }),
    }),
  })
