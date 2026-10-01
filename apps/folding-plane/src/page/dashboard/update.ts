import { Effect, Option } from 'effect'
import { HttpClient } from 'effect/http'
import { AsyncData, Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type CoinStatPage, Query, call } from '../../api'
import { Message } from './message'
import { Model, type Seed, attentionRows, initialModel } from './model'

// COMMAND

/**
 * The reads behind the two shortlists. Each requires the API services rather
 * than providing them, so the browser runs it in a Command against its own
 * origin and the server runs it before it renders.
 */
export const readBlocked = (): Effect.Effect<
  CoinStatPage,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> =>
  Query.fetchCoinStats({
    limit: attentionRows,
    page: 1,
    search: '',
    searchBy: ['symbol', 'name'],
    flag: 'blocked',
    sortBy: 'blocked',
    order: 'desc',
  })

export const readThin = (): Effect.Effect<
  CoinStatPage,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> =>
  Query.fetchCoinStats({
    limit: attentionRows,
    page: 1,
    search: '',
    searchBy: ['symbol', 'name'],
    flag: 'single',
    sortBy: 'markets',
    order: 'asc',
  })

export const FetchBlocked = Command.define('FetchBlocked', {
  messages: [Message.SettledFetchBlocked],
  execute: call(readBlocked()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchBlocked({ result })),
  ),
})

export const FetchThin = Command.define('FetchThin', {
  messages: [Message.SettledFetchThin],
  execute: call(readThin()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchThin({ result })),
  ),
})

// LOAD

const loadBlocked = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, { blocked: () => AsyncData.Loading() }),
  commands: [FetchBlocked()],
})

const loadThin = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, { thin: () => AsyncData.Loading() }),
  commands: [FetchThin()],
})

const refreshBlocked: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.blocked), {
    onNone: () => ({ model }),
    onSome: (blocked) => ({
      model: modifyFields(model, { blocked: () => blocked }),
      commands: [FetchBlocked()],
    }),
  })

const refreshThin: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.thin), {
    onNone: () => ({ model }),
    onSome: (thin) => ({
      model: modifyFields(model, { thin: () => thin }),
      commands: [FetchThin()],
    }),
  })

/**
 * Fetch what has never loaded. A list that already holds rows, or a reason
 * with a retry, is left alone: arriving from another page must not refetch
 * what the dashboard already shows.
 */
const loadIdle = (model: Model): Update.Return<Model, Message> => {
  const blocked = AsyncData.isIdle(model.blocked) ? loadBlocked(model) : { model }
  const thin = AsyncData.isIdle(blocked.model.thin) ? loadThin(blocked.model) : { model: blocked.model }

  return {
    model: thin.model,
    commands: [...(blocked.commands ?? []), ...(thin.commands ?? [])],
  }
}

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them both shortlists are on their way.
 */
export const init = (
  maybeSeed: Option.Option<Seed>,
): Update.Return<Model, Message> =>
  Option.match(maybeSeed, {
    onNone: () => loadIdle(initialModel),
    onSome: (seed) => ({
      model: modifyFields(initialModel, {
        blocked: () => seed.blocked,
        thin: () => seed.thin,
      }),
    }),
  })

/**
 * Tell the page the URL named it. It carries no listing state, so entering it
 * only fetches what never loaded.
 */
export const entered = (model: Model): Update.Return<Model, Message> => loadIdle(model)

// UPDATE

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedRetryBlocked: () => refreshBlocked(model),

    ClickedRetryThin: () => refreshThin(model),

    SettledFetchBlocked: ({ result }) => ({
      model: modifyFields(model, { blocked: AsyncData.settle(result) }),
    }),

    SettledFetchThin: ({ result }) => ({
      model: modifyFields(model, { thin: AsyncData.settle(result) }),
    }),
  })
