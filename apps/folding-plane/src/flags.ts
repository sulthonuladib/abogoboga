import { Effect, Match, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { AsyncData } from 'foldkit'
import type { Url } from 'foldkit/url'

import { type ApiOrigin, isApiFailure } from './api'
import { readCoverage } from './coverage'
import { CoverageData } from './coverage'
import * as Chains from './page/chains'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'
import { chainsQueryFromRoute, exchangesQueryFromRoute, urlToAppRoute } from './route'
import { themeFromCookieHeader } from './theme'

// FAILURE

const detailOf = (error: unknown): string =>
  isApiFailure(error) ? error.detail : 'the control plane could not be read'

/**
 * A read that always produces a state: the rows, or the reason there are none.
 * A page the control plane could not reach still renders, with the reason on it
 * and a retry beside it.
 */
export const settled = <A, E>(
  read: Effect.Effect<A, E, ApiOrigin | HttpClient.HttpClient>,
): Effect.Effect<
  AsyncData.AsyncData<A, string>,
  never,
  ApiOrigin | HttpClient.HttpClient
> =>
  read.pipe(
    Effect.mapError(detailOf),
    Effect.result,
    Effect.map((result) => AsyncData.settle(AsyncData.Idle(), result)),
  )

// FLAGS

/**
 * The values the server resolved before rendering: the theme from the request,
 * the rail's figures, and what the rendered page needs. The client decodes
 * these and calls `init` with them, so the page a browser hydrates is the page
 * the server sent, and nothing is fetched twice.
 *
 * A page's seed is absent when the server rendered a different route, and the
 * page then fetches its own data.
 */
export const Flags = Schema.Struct({
  theme: Schema.Literals(['Light', 'Dark']),
  coverage: CoverageData.schema,
  chains: Schema.Option(Chains.Chains.schema),
  dashboard: Schema.Option(Dashboard.Seed),
  exchanges: Schema.Option(Exchanges.Exchanges.schema),
  exchangeDetail: Schema.Option(ExchangeDetail.Seed),
})

export type Flags = typeof Flags.Type

type Api = ApiOrigin | HttpClient.HttpClient

export const flagsFor = (
  cookieHeader: string,
  url: Url,
): Effect.Effect<Flags, never, Api> =>
  Effect.gen(function* () {
    const route = urlToAppRoute(url)
    const chains = yield* Match.value(route).pipe(
      Match.tag(
        'Chains',
        (chainsRoute) =>
          Effect.map(
            settled(Chains.readChains(chainsQueryFromRoute(chainsRoute))),
            Option.some,
          ),
      ),
      Match.orElse(() => Effect.succeed(Option.none<Chains.Chains>())),
    )
    const dashboard = yield* Match.value(route).pipe(
      Match.tag('Dashboard', () =>
        Effect.gen(function* () {
          const blocked = yield* settled(Dashboard.readBlocked())
          const thin = yield* settled(Dashboard.readThin())

          return Option.some(Dashboard.Seed.make({ blocked, thin }))
        })),
      Match.orElse(() => Effect.succeed(Option.none<Dashboard.Seed>())),
    )
    const exchanges = yield* Match.value(route).pipe(
      Match.tag(
        'Exchanges',
        (exchangesRoute) =>
          Effect.map(
            settled(Exchanges.readExchanges(exchangesQueryFromRoute(exchangesRoute))),
            Option.some,
          ),
      ),
      Match.orElse(() => Effect.succeed(Option.none<Exchanges.Exchanges>())),
    )
    const exchangeDetail = yield* Match.value(route).pipe(
      Match.tag('ExchangeDetail', ({ exchangeId }) =>
        Effect.gen(function* () {
          const exchange = yield* settled(ExchangeDetail.readExchange(exchangeId))
          const markets = yield* settled(ExchangeDetail.readMarkets(exchangeId))
          const coins = yield* settled(ExchangeDetail.readCoins())

          return Option.some(ExchangeDetail.Seed.make({ exchange, markets, coins }))
        })),
      Match.orElse(() => Effect.succeed(Option.none<ExchangeDetail.Seed>())),
    )

    return Flags.make({
      theme: themeFromCookieHeader(cookieHeader),
      coverage: yield* settled(readCoverage),
      chains,
      dashboard,
      exchanges,
      exchangeDetail,
    })
  })
