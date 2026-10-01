import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/http'
import { AsyncData, Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, Query, call } from '../../api'
import type { WorkerStatus } from '../../api'
import { Message, OutMessage } from './message'
import { Model, initialModel } from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

// COMMAND

/**
 * The read behind the monitor. It requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders.
 */
export const readWorkers = (): Effect.Effect<
  ReadonlyArray<WorkerStatus>,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> => Query.listWorkers()

export const FetchWorkers = Command.define('FetchWorkers', {
  messages: [Message.SettledFetchWorkers],
  execute: call(readWorkers()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchWorkers({ result })),
  ),
})

/**
 * The socket delivered a worker snapshot. The parent drives this fact through
 * this capability rather than constructing a child Message, so the socket
 * wiring stays free of the page's Message union. A pushed snapshot settles the
 * rows to success, so it also recovers a page that previously failed to load.
 */
export const receivedWorkers = (
  rows: ReadonlyArray<WorkerStatus>,
): Update.Step<Model, Message> => (model) => ({
  model: modifyFields(model, { workers: () => AsyncData.succeed(rows) }),
})

export const StartWorker = Command.define('StartWorker', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SucceededStartWorker, Message.FailedWorkerRequest],
  execute: ({ exchangeId }) =>
    call(Query.startWorker(exchangeId)).pipe(
      Effect.map((worker) => Message.SucceededStartWorker({ exchangeSlug: worker.exchangeSlug })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedWorkerRequest({ detail: error.detail })),
      ),
    ),
})

export const StopWorker = Command.define('StopWorker', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SucceededStopWorker, Message.FailedWorkerRequest],
  execute: ({ exchangeId }) =>
    call(Query.stopWorker(exchangeId)).pipe(
      Effect.map((worker) => Message.SucceededStopWorker({ exchangeSlug: worker.exchangeSlug })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedWorkerRequest({ detail: error.detail })),
      ),
    ),
})

// LOAD

const loadAll = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, { workers: () => AsyncData.Loading() }),
  commands: [FetchWorkers()],
})

const refresh: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.workers), {
    onNone: () => ({ model }),
    onSome: (workers) => ({
      model: modifyFields(model, { workers: () => workers }),
      commands: [FetchWorkers()],
    }),
  })

const withPending = (model: Model, exchangeId: number): Model =>
  modifyFields(model, {
    pendingIds: (ids) => ids.includes(exchangeId) ? ids : [...ids, exchangeId],
    notice: () => Option.none(),
  })

const withoutPending = (model: Model, exchangeId: number): Model =>
  modifyFields(model, {
    pendingIds: (ids) => ids.filter((id) => id !== exchangeId),
  })

const pendingOf = (message: { exchangeId: number }): number => message.exchangeId

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the workers are on their way.
 */
export const init = (
  maybeWorkers: Option.Option<Model['workers']>,
): UpdateReturn =>
  Option.match(maybeWorkers, {
    onNone: () => loadAll(initialModel),
    onSome: (workers) => ({
      model: modifyFields(initialModel, { workers: () => workers }),
    }),
  })

/**
 * Tell the page the URL named it. It carries no listing state, so entering it
 * only fetches what never loaded.
 */
export const entered = (model: Model): Update.Return<Model, Message> =>
  AsyncData.isIdle(model.workers) ? loadAll(model) : { model }

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ReceivedWorkers: ({ workers }) => receivedWorkers(workers)(model),

    ClickedRetry: () => refresh(model),

    SettledFetchWorkers: ({ result }) => ({
      model: modifyFields(model, { workers: AsyncData.settle(result) }),
    }),

    ClickedStartWorker: ({ exchangeId }) => ({
      model: withPending(model, exchangeId),
      commands: [StartWorker({ exchangeId })],
    }),

    ClickedStopWorker: ({ exchangeId }) => ({
      model: withPending(model, exchangeId),
      commands: [StopWorker({ exchangeId })],
    }),

    SucceededStartWorker: () =>
      Update.withOutMessage(
        Update.combine(model, [
          (current) => ({
            model: modifyFields(current, {
              pendingIds: () => [],
              notice: () => Option.none(),
            }),
          }),
          refresh,
        ]),
        OutMessage.ChangedWorkers(),
      ),

    SucceededStopWorker: () =>
      Update.withOutMessage(
        Update.combine(model, [
          (current) => ({
            model: modifyFields(current, {
              pendingIds: () => [],
              notice: () => Option.none(),
            }),
          }),
          refresh,
        ]),
        OutMessage.ChangedWorkers(),
      ),

    FailedWorkerRequest: ({ detail }) => ({
      model: modifyFields(model, {
        pendingIds: () => [],
        notice: () => Option.some(detail),
      }),
    }),
  })

export const pendingExchangeOf = pendingOf

export const clearPendingFor = withoutPending
