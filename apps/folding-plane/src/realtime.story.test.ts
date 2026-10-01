import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import type { SignalRow, WorkerStatus } from './api'
import { initialModel } from './model'
import { Message } from './message'
import { RetrySocket, update } from './update'

const row: SignalRow = {
  opportunityId: 1,
  symbol: 'BTC',
  buyExchangeId: 2,
  buyExchangeSymbol: 'BTC/IDR',
  buyPrice: 1_000_000,
  buyVolume: 2,
  buyTickTimestamp: 1_000,
  sellExchangeId: 3,
  sellExchangeSymbol: 'BTC/USDT',
  sellPrice: 1_100_000,
  sellVolume: 3,
  sellTickTimestamp: 1_000,
  profitPercent: 10,
  profitVolume: 0.2,
}

describe('socket lifecycle', () => {
  test('an acquired socket connects', () => {
    story(
      update,
      given(initialModel),
      message(Message.SocketAcquired()),
      model((next) => {
        expect(next.connection._tag).toBe('Connected')
      }),
    )
  })

  test('a released socket disconnects', () => {
    story(
      update,
      given(initialModel),
      message(Message.SocketReleased()),
      model((next) => {
        expect(next.connection._tag).toBe('Disconnected')
      }),
    )
  })

  test('a failed acquire keeps the reason and asks to retry', () => {
    story(
      update,
      given(initialModel),
      message(Message.SocketFailed({ detail: 'connection refused' })),
      model((next) => {
        expect(next.connection).toEqual({ _tag: 'Error', detail: 'connection refused' })
      }),
      Command.resolve(RetrySocket(), Message.RetrySocket()),
      model((next) => {
        expect(next.socketGeneration).toBe(1)
      }),
    )
  })

  test('a closed socket asks for a reconnect', () => {
    story(
      update,
      given(initialModel),
      message(Message.SocketClosed()),
      model((next) => {
        expect(next.connection._tag).toBe('Connecting')
        expect(next.socketGeneration).toBe(1)
      }),
    )
  })
})

describe('signal frames', () => {
  test('an arriving signal folds into the signal page', () => {
    story(
      update,
      given(initialModel),
      message(Message.ReceivedSignalRows({ rows: [row] })),
      model((next) => {
        expect(next.signals.rows).toEqual([row])
      }),
    )
  })
})

const workerStatus: WorkerStatus = {
  exchangeId: 1,
  exchangeSlug: 'binance',
  desired: 'started',
  running: true,
  shards: [],
  restarts: 0,
  subscribedCoins: 0,
}

describe('workers frames', () => {
  test('an arriving worker snapshot folds into the workers page', () => {
    story(
      update,
      given(initialModel),
      message(Message.ReceivedWorkers({ workers: [workerStatus] })),
      model((next) => {
        if (!AsyncData.isSuccess(next.workers.workers)) {
          throw new Error('expected the rows to settle to success')
        }

        expect(next.workers.workers.data).toEqual([workerStatus])
      }),
    )
  })
})
