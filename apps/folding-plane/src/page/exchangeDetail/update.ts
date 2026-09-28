import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { AsyncData, Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type CoinPage, type Exchange, Query, call } from '../../api'
import type { MarketAssignment } from '../../api'
import { Message } from './message'
import { type Seed, initFor } from './model'
import { Model } from './model'

// COMMAND

/**
 * The reads behind the page. Each requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders. The coin index is one read for
 * every row (`limit: -1`), so a market's coin never costs a request of its own.
 */
export const readExchange = (
  exchangeId: number,
): Effect.Effect<Exchange, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.findExchange(exchangeId)

export const readMarkets = (
  exchangeId: number,
): Effect.Effect<ReadonlyArray<MarketAssignment>, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.listExchangeMarkets(exchangeId)

export const readCoins = (): Effect.Effect<
  CoinPage,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> => Query.coinIndex()

export const FetchExchange = Command.define('FetchExchange', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SettledFetchExchange],
  execute: ({ exchangeId }) =>
    call(readExchange(exchangeId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchExchange({ result })),
    ),
})

export const FetchMarkets = Command.define('FetchMarkets', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SettledFetchMarkets],
  execute: ({ exchangeId }) =>
    call(readMarkets(exchangeId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchMarkets({ result })),
    ),
})

export const FetchCoins = Command.define('FetchCoins', {
  messages: [Message.SettledFetchCoins],
  execute: call(readCoins()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchCoins({ result })),
  ),
})

// LOAD

const loadAll = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, {
    exchange: () => AsyncData.Loading(),
    markets: () => AsyncData.Loading(),
    coins: () => AsyncData.Loading(),
  }),
  commands: [
    FetchExchange({ exchangeId: model.exchangeId }),
    FetchMarkets({ exchangeId: model.exchangeId }),
    FetchCoins(),
  ],
})

const refreshExchange: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.exchange), {
    onNone: () => ({ model }),
    onSome: (exchange) => ({
      model: modifyFields(model, { exchange: () => exchange }),
      commands: [FetchExchange({ exchangeId: model.exchangeId })],
    }),
  })

const refreshMarkets: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.markets), {
    onNone: () => ({ model }),
    onSome: (markets) => ({
      model: modifyFields(model, { markets: () => markets }),
      commands: [FetchMarkets({ exchangeId: model.exchangeId })],
    }),
  })

const refreshCoins: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.coins), {
    onNone: () => ({ model }),
    onSome: (coins) => ({
      model: modifyFields(model, { coins: () => coins }),
      commands: [FetchCoins()],
    }),
  })

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the exchange, its markets, and the coin index are on their way.
 */
export const init = (
  exchangeId: number,
  maybeSeed: Option.Option<Seed>,
): Update.Return<Model, Message> =>
  Option.match(maybeSeed, {
    onNone: () => loadAll(initFor(exchangeId)),
    onSome: (seed) => ({
      model: {
        exchangeId,
        exchange: seed.exchange,
        markets: seed.markets,
        coins: seed.coins,
      },
    }),
  })

/**
 * Tell the page the URL named it. A different exchange starts over; the same
 * one keeps what it holds, fetching only what never loaded, so navigating
 * away and back does not refetch it.
 */
export const showExchange = (
  model: Model,
  exchangeId: number,
): Update.Return<Model, Message> =>
  model.exchangeId !== exchangeId
    ? loadAll(initFor(exchangeId))
    : Update.combine(model, [
      (current) =>
        AsyncData.isIdle(current.exchange) ? refreshExchange(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.markets) ? refreshMarkets(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.coins) ? refreshCoins(current) : { model: current },
    ])

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedRetry: () =>
      Update.combine(model, [refreshExchange, refreshMarkets, refreshCoins]),

    SettledFetchExchange: ({ result }) => ({
      model: modifyFields(model, { exchange: AsyncData.settle(result) }),
    }),

    SettledFetchMarkets: ({ result }) => ({
      model: modifyFields(model, { markets: AsyncData.settle(result) }),
    }),

    SettledFetchCoins: ({ result }) => ({
      model: modifyFields(model, { coins: AsyncData.settle(result) }),
    }),
  })
