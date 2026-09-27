import { Effect, Match, Option, Schema } from 'effect'
import { AsyncData, Command, Runtime, Update } from 'foldkit'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import { call, isApiFailure } from './api'
import { readCoverage } from './coverage'
import type { Flags } from './flags'
import { Message } from './message'
import type { Model, Theme } from './model'
import * as Chains from './page/chains'
import { AppRoute, chainsQueryFromRoute, urlToAppRoute } from './route'
import { THEME_COOKIE } from './theme'

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
    }).pipe(
      Effect.as(Message.CompletedPersistTheme()),
      Effect.catch(() => Effect.succeed(Message.CompletedPersistTheme())),
    ),
})

const FetchCoverage = Command.define('FetchCoverage', {
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

// ROUTE

const setRoute =
  (nextRoute: AppRoute): Update.Step<Model, Message> =>
  (model) => ({ model: modifyFields(model, { route: () => nextRoute }) })

/**
 * The steps a route change runs: the new route first, then the page it belongs
 * to. A page hears about a route only when the URL names it, so navigating away
 * from a listing does not refetch it.
 */
const pageSteps = (route: AppRoute): ReadonlyArray<Update.Step<Model, Message>> =>
  Match.value(route).pipe(
    Match.tag('Chains', (chainsRoute) => [
      foldChainsRouteChanged(chainsQueryFromRoute(chainsRoute)),
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
    coverage: flags.coverage,
    chains: Chains.initialModel,
  }

  return Match.value(route).pipe(
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

    ClickedToggleTheme: () => {
      const theme: Theme = model.theme === 'Light' ? 'Dark' : 'Light'

      return {
        model: modifyFields(model, { theme: () => theme }),
        commands: [PersistTheme({ theme })],
      }
    },

    ClickedRefreshCoverage: () => refreshCoverage(model),

    SettledFetchCoverage: ({ result }) => ({
      model: modifyFields(model, { coverage: AsyncData.settle(result) }),
    }),

    GotChainsMessage: ({ message }) => foldChains(model, message),
  })
