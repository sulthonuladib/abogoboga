import { Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import {
  Command,
  Subscription,
  click,
  expect,
  given,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { WorkerStatus } from '../../api'
import { Message } from './message'
import { Model, initialModel } from './model'
import { FetchWorkers, StartWorker, StopWorker, update } from './update'
import { view } from './view'

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
        phase: 'running',
        attempt: null,
        lastTickAt: null,
      },
    ],
    restarts: 1,
    subscribedCoins: 8,
  },
  {
    exchangeId: 12,
    exchangeSlug: 'kucoin',
    desired: 'started',
    running: true,
    shards: [
      {
        shardId: 'shard-0',
        size: 4,
        restarts: 3,
        phase: 'reconnecting',
        attempt: 2,
        lastTickAt: null,
      },
    ],
    restarts: 3,
    subscribedCoins: 5,
  },
])

const loadedModel: Model = {
  ...initialModel,
  workers: AsyncData.succeed(fixtureWorkers),
}

describe('workers', () => {
  test('a stopped row offers a start', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('binance')).toExist(),
      expect(text('stopped')).toExist(),
      expect(text('no shards')).toExist(),
      expect(role('button', { name: 'Start binance' })).toExist(),
    )
  })

  test('a running row offers a stop with its shards', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('indodax')).toExist(),
      expect(text('running')).toExist(),
      expect(text('shard-0')).toBeAbsent(),
      expect(role('button', { name: 'Stop indodax' })).toExist(),
      expect(text('restarts 2')).toExist(),
    )
  })

  test('a reconnecting row names its phase and restarts', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('kucoin')).toExist(),
      expect(text('reconnecting')).toExist(),
      expect(text('restarts 3')).toExist(),
    )
  })

  test('a refused start shows the reason and leaves the row', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Start binance' })),
      Command.resolve(
        StartWorker({ exchangeId: 10 }),
        Message.FailedWorkerRequest({ detail: 'worker is already running' }),
      ),
      expect(role('alert')).toExist(),
      expect(text('Worker request refused')).toExist(),
      expect(text('worker is already running')).toExist(),
      expect(text('binance')).toExist(),
    )
  })

  test('starting a worker re-reads the monitor', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Start binance' })),
      Command.resolve(
        StartWorker({ exchangeId: 10 }),
        Message.SucceededStartWorker({ exchangeSlug: 'binance' }),
      ),
      Command.resolve(
        FetchWorkers(),
        Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) }),
      ),
      expect(text('binance')).toExist(),
      expect(role('alert')).toBeAbsent(),
    )
  })

  test('stopping a worker re-reads the monitor', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Stop indodax' })),
      Command.resolve(
        StopWorker({ exchangeId: 11 }),
        Message.SucceededStopWorker({ exchangeSlug: 'indodax' }),
      ),
      Command.resolve(
        FetchWorkers(),
        Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) }),
      ),
      expect(text('indodax')).toExist(),
    )
  })

  test('a lone started exchange renders as running with zero subscribed', () => {
    const lone: Model = {
      ...initialModel,
      workers: AsyncData.succeed(
        Schema.decodeUnknownSync(Schema.Array(WorkerStatus))([
          {
            exchangeId: 20,
            exchangeSlug: 'kraken',
            desired: 'started',
            running: true,
            shards: [
              {
                shardId: 'kraken-shard-1',
                size: 0,
                restarts: 0,
                phase: 'running',
                attempt: null,
                lastTickAt: null,
              },
            ],
            restarts: 0,
            subscribedCoins: 0,
          },
        ]),
      ),
    }

    scene(
      { update, view },
      given(lone),
      expect(text('kraken')).toExist(),
      expect(text('running')).toExist(),
      expect(text('Subscribed coins')).toExist(),
      expect(role('button', { name: 'Stop kraken' })).toExist(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given({ ...initialModel, workers: AsyncData.fail('unreachable') }),
      expect(role('alert')).toExist(),
      expect(text('Could not load workers')).toExist(),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchWorkers(),
        Message.SettledFetchWorkers({ result: Result.succeed(fixtureWorkers) }),
      ),
      expect(text('binance')).toExist(),
    )
  })

  test('a monitor with no exchanges says so', () => {
    scene(
      { update, view },
      given({ ...initialModel, workers: AsyncData.succeed([]) }),
      expect(text('No exchanges yet')).toExist(),
    )
  })

  test('a received snapshot renders the pushed rows without refetching', () => {
    scene(
      { update, view },
      given({ ...initialModel, workers: AsyncData.fail('unreachable') }),
      Subscription.emit(Message.ReceivedWorkers({ workers: fixtureWorkers })),
      expect(text('binance')).toExist(),
      expect(text('indodax')).toExist(),
      expect(role('alert')).toBeAbsent(),
    )
  })
})
