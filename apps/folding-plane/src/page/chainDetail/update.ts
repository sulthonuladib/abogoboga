import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/http'
import { AsyncData, Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type Chain, type ChainLink, type CoinPage, Query, call } from '../../api'
import type { MarketAssignment } from '../../api'
import { Message } from './message'
import { type Seed, initFor } from './model'
import { Model } from './model'

// COMMAND

/**
 * The reads behind the page. Each requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders. The market and coin indexes are
 * one read each (`limit: -1`), so a link's market and coin never cost a
 * request of their own. A link whose market cannot be resolved is skipped.
 */
export const readChain = (
  chainId: number,
): Effect.Effect<Chain, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.findChain(chainId)

export const readLinks = (
  chainId: number,
): Effect.Effect<ReadonlyArray<ChainLink>, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.listChainLinks(chainId)

export const readMarkets = (): Effect.Effect<
  ReadonlyArray<MarketAssignment>,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> => Query.marketIndex()

export const readCoins = (): Effect.Effect<
  CoinPage,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> => Query.coinIndex()

export const FetchChain = Command.define('FetchChain', {
  args: { chainId: Schema.Int },
  messages: [Message.SettledFetchChain],
  execute: ({ chainId }) =>
    call(readChain(chainId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchChain({ result })),
    ),
})

export const FetchLinks = Command.define('FetchLinks', {
  args: { chainId: Schema.Int },
  messages: [Message.SettledFetchLinks],
  execute: ({ chainId }) =>
    call(readLinks(chainId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchLinks({ result })),
    ),
})

export const FetchMarkets = Command.define('FetchMarkets', {
  messages: [Message.SettledFetchMarkets],
  execute: call(readMarkets()).pipe(
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
    chain: () => AsyncData.Loading(),
    links: () => AsyncData.Loading(),
    markets: () => AsyncData.Loading(),
    coins: () => AsyncData.Loading(),
  }),
  commands: [
    FetchChain({ chainId: model.chainId }),
    FetchLinks({ chainId: model.chainId }),
    FetchMarkets(),
    FetchCoins(),
  ],
})

const refreshChain: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.chain), {
    onNone: () => ({ model }),
    onSome: (chain) => ({
      model: modifyFields(model, { chain: () => chain }),
      commands: [FetchChain({ chainId: model.chainId })],
    }),
  })

const refreshLinks: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.links), {
    onNone: () => ({ model }),
    onSome: (links) => ({
      model: modifyFields(model, { links: () => links }),
      commands: [FetchLinks({ chainId: model.chainId })],
    }),
  })

const refreshMarkets: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.markets), {
    onNone: () => ({ model }),
    onSome: (markets) => ({
      model: modifyFields(model, { markets: () => markets }),
      commands: [FetchMarkets()],
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
 * without them the chain, its links, and the two indexes are on their way.
 */
export const init = (
  chainId: number,
  maybeSeed: Option.Option<Seed>,
): Update.Return<Model, Message> =>
  Option.match(maybeSeed, {
    onNone: () => loadAll(initFor(chainId)),
    onSome: (seed) => ({
      model: {
        chainId,
        chain: seed.chain,
        links: seed.links,
        markets: seed.markets,
        coins: seed.coins,
      },
    }),
  })

/**
 * Tell the page the URL named it. A different chain starts over; the same
 * one keeps what it holds, fetching only what never loaded, so navigating
 * away and back does not refetch it.
 */
export const showChain = (
  model: Model,
  chainId: number,
): Update.Return<Model, Message> =>
  model.chainId !== chainId
    ? loadAll(initFor(chainId))
    : Update.combine(model, [
      (current) =>
        AsyncData.isIdle(current.chain) ? refreshChain(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.links) ? refreshLinks(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.markets) ? refreshMarkets(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.coins) ? refreshCoins(current) : { model: current },
    ])

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedRetry: () =>
      Update.combine(model, [refreshChain, refreshLinks, refreshMarkets, refreshCoins]),

    SettledFetchChain: ({ result }) => ({
      model: modifyFields(model, { chain: AsyncData.settle(result) }),
    }),

    SettledFetchLinks: ({ result }) => ({
      model: modifyFields(model, { links: AsyncData.settle(result) }),
    }),

    SettledFetchMarkets: ({ result }) => ({
      model: modifyFields(model, { markets: AsyncData.settle(result) }),
    }),

    SettledFetchCoins: ({ result }) => ({
      model: modifyFields(model, { coins: AsyncData.settle(result) }),
    }),
  })
