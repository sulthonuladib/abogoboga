import { Option, Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { WorkerStatus } from '../../api'
import { Message, OutMessage } from './message'
import { Model, initialModel } from './model'
import { FetchWorkers, StartWorker, StopWorker, entered, init, update } from './update'

const fixtureWorkers = Schema.decodeUnknownSync(Schema.Array(WorkerStatus))([
  {
    exchangeId: 10,
    exchangeSlug: 'binance',
    desired: 'stopped',
    running: false,
    shards: [],
    restarts: 0,
    subscribedCoins: 12,
  },
  {
    exchangeId: 11,
    exchangeSlug: 'indodax',
    desired: 'started',
    running: true,
    shards: [
      {
        shardId: 'shard-0',
        size: 6,
        restarts: 2,
        phase: 'reconnecting',
        attempt: 3,
        lastTickAt: 1700000000000,
      },
    ],
    restarts: 2,
    subscribedCoins: 8,
  },
])

const loadedModel: Model = {
  ...initialModel,
  workers: AsyncData.succeed(fixtureWorkers),
  notice: Option.none(),
  pendingIds: [],
}

describe('init', () => {
  test('without a seed the workers load', () => {
    const started = init(Option.none())

    expect(AsyncData.isLoading(started.model.workers)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([FetchWorkers.name])
  })

  test('with a seed nothing fetches', () => {
    const started = init(Option.some(AsyncData.succeed(fixtureWorkers)))

    expect(AsyncData.isSuccess(started.model.workers)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('entered', () => {
  test('a loaded page fetches nothing', () => {
    expect(entered(loadedModel).commands).toBeUndefined()
  })

  test('a page that never loaded fetches', () => {
    const next = entered(initialModel)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchWorkers.name])
  })
})

describe('update', () => {
  test('a settled fetch fills the monitor', () => {
    story(
      update,
      given({ ...initialModel, workers: AsyncData.Loading() }),
      message(Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.workers)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('starting a stopped worker re-reads and re-reads the rail', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedStartWorker({ exchangeId: 10 })),
      Command.resolve(
        StartWorker({ exchangeId: 10 }),
        Message.SucceededStartWorker({ exchangeSlug: 'binance' }),
      ),
      expectOutMessage(OutMessage.ChangedWorkers()),
      Command.resolve(
        FetchWorkers(),
        Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) }),
      ),
      Command.expectNone(),
    )
  })

  test('stopping a running worker re-reads and re-reads the rail', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedStopWorker({ exchangeId: 11 })),
      Command.resolve(
        StopWorker({ exchangeId: 11 }),
        Message.SucceededStopWorker({ exchangeSlug: 'indodax' }),
      ),
      expectOutMessage(OutMessage.ChangedWorkers()),
      Command.resolve(
        FetchWorkers(),
        Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) }),
      ),
      Command.expectNone(),
    )
  })

  test('a redundant request is refused with a reason and the row is unchanged', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedStartWorker({ exchangeId: 11 })),
      Command.resolve(
        StartWorker({ exchangeId: 11 }),
        Message.FailedWorkerRequest({ detail: 'worker is already running' }),
      ),
      model((next) => {
        expect(next.notice).toEqual(Option.some('worker is already running'))
        expect(AsyncData.isSuccess(next.workers)).toBe(true)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a refused stop keeps the reason', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedStopWorker({ exchangeId: 10 })),
      Command.resolve(
        StopWorker({ exchangeId: 10 }),
        Message.FailedWorkerRequest({ detail: 'worker is not running' }),
      ),
      model((next) => {
        expect(next.notice).toEqual(Option.some('worker is not running'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })
})
