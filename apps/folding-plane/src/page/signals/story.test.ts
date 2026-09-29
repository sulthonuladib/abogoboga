import { Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ExchangeJson, type SignalRow, freshnessWindowMs } from '../../api'
import { type SignalsQuery, defaultSignalsQuery, signalsUrl } from '../../route'
import { Message } from './message'
import { initialModel } from './model'
import {
  FetchExchanges,
  NavigateSignals,
  derivedRows,
  entered,
  init,
  sortedRows,
  update,
} from './update'

const baseRow: SignalRow = {
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

const staleRow: SignalRow = {
  ...baseRow,
  opportunityId: 2,
  symbol: 'ETH',
  buyTickTimestamp: 1_000,
  sellTickTimestamp: 1_000,
}

describe('signals update', () => {
  test('a snapshot replaces the rows whole', () => {
    story(
      update,
      given({ ...initialModel, rows: [baseRow] }),
      message(Message.ReceivedSignal({ rows: [{ ...staleRow, opportunityId: 9 }] })),
      model((next) => {
        expect(next.rows).toHaveLength(1)
        expect(next.rows[0]?.opportunityId).toBe(9)
      }),
    )
  })

  test('a tick drops a row whose ticks left the window', () => {
    story(
      update,
      given({ ...initialModel, rows: [baseRow, staleRow] }),
      message(Message.Ticked({ now: 1_000 + freshnessWindowMs + 1 })),
      model((next) => {
        expect(next.rows).toHaveLength(0)
      }),
    )
  })

  test('a tick keeps a row still inside the window', () => {
    const now = 1_000 + freshnessWindowMs - 1
    const fresh: SignalRow = { ...staleRow, opportunityId: 3, sellTickTimestamp: now }

    story(
      update,
      given({ ...initialModel, rows: [fresh] }),
      message(Message.Ticked({ now })),
      model((next) => {
        expect(next.rows.map((row) => row.opportunityId)).toEqual([3])
      }),
    )
  })
})

const exchange = Schema.decodeUnknownSync(ExchangeJson)({
  id: 10,
  coingeckoId: 'binance',
  name: 'Binance',
  slug: 'binance',
  logo: 'binance.svg',
  registeredOnCmc: true,
  baseCurrency: 'usdt',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
})

describe('exchange directory', () => {
  test('init starts loading the directory with the route query', () => {
    const started = init({ ...defaultSignalsQuery, view: 'table' })

    expect(AsyncData.isLoading(started.model.exchanges)).toBe(true)
    expect(started.model.query.view).toBe('table')
    expect(started.commands?.map((command) => command.name)).toEqual([FetchExchanges.name])
  })

  test('a loaded page fetches nothing', () => {
    const next = entered({ ...initialModel, exchanges: AsyncData.succeed([exchange]) })

    expect(next.commands).toBeUndefined()
  })

  test('a page that never loaded fetches the directory', () => {
    const next = entered(initialModel)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchExchanges.name])
  })

  test('a settled fetch fills the directory', () => {
    story(
      update,
      given(initialModel),
      message(Message.SettledFetchExchanges({ result: Result.succeed([exchange]) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.exchanges)).toBe(true)
      }),
    )
  })
})

describe('signals sort', () => {
  const higherPercent: SignalRow = { ...baseRow, opportunityId: 4, profitPercent: 20, profitVolume: 1 }
  const higherVolume: SignalRow = { ...baseRow, opportunityId: 5, profitPercent: 5, profitVolume: 9 }

  test('selecting a figure navigates to the sorted route', () => {
    const url = signalsUrl({ ...defaultSignalsQuery, sort: 'profitVolume' })

    story(
      update,
      given(initialModel),
      message(Message.SelectedSort({ sort: 'profitVolume' })),
      Command.expectExact(NavigateSignals({ url })),
      Command.resolve(NavigateSignals, Message.CompletedNavigateSignals()),
    )
  })

  test('selecting a view navigates to the view route', () => {
    const url = signalsUrl({ ...defaultSignalsQuery, view: 'table' })

    story(
      update,
      given(initialModel),
      message(Message.SelectedView({ view: 'table' })),
      Command.expectExact(NavigateSignals({ url })),
      Command.resolve(NavigateSignals, Message.CompletedNavigateSignals()),
    )
  })

  test('rows order by profit percent, largest first', () => {
    expect(sortedRows([higherVolume, higherPercent], 'profitPercent').map((row) => row.opportunityId))
      .toEqual([4, 5])
  })

  test('rows order by profit volume, largest first', () => {
    expect(sortedRows([higherPercent, higherVolume], 'profitVolume').map((row) => row.opportunityId))
      .toEqual([5, 4])
  })
})

describe('signals derived rows', () => {
  const lowPercent: SignalRow = {
    ...baseRow,
    opportunityId: 1,
    buyExchangeId: 2,
    sellExchangeId: 3,
    profitPercent: 0.2,
    profitVolume: 5,
  }
  const highPercent: SignalRow = {
    ...baseRow,
    opportunityId: 2,
    buyExchangeId: 4,
    sellExchangeId: 5,
    profitPercent: 5,
    profitVolume: 1,
  }
  const highVolume: SignalRow = {
    ...baseRow,
    opportunityId: 3,
    buyExchangeId: 2,
    sellExchangeId: 5,
    profitPercent: 1,
    profitVolume: 9,
  }

  test('rows below the profit floor drop out', () => {
    const query: SignalsQuery = { ...defaultSignalsQuery, threshold: 0.5 }

    expect(derivedRows([lowPercent, highPercent], query).map((row) => row.opportunityId))
      .toEqual([2])
  })

  test('a row exactly at the floor stays', () => {
    const query: SignalsQuery = { ...defaultSignalsQuery, threshold: 0.2 }

    expect(derivedRows([lowPercent], query).map((row) => row.opportunityId)).toEqual([1])
  })

  test('rows touching a hidden exchange drop out', () => {
    const query: SignalsQuery = { ...defaultSignalsQuery, hiddenExchanges: [2] }

    expect(derivedRows([lowPercent, highPercent, highVolume], query).map((row) => row.opportunityId))
      .toEqual([2])
  })

  test('the derived set sorts by the selected figure', () => {
    const query: SignalsQuery = { ...defaultSignalsQuery, sort: 'profitVolume' }

    expect(derivedRows([lowPercent, highPercent, highVolume], query).map((row) => row.opportunityId))
      .toEqual([3, 1, 2])
  })

  test('the controls compose: floor, hiding, then sort', () => {
    const query: SignalsQuery = {
      ...defaultSignalsQuery,
      threshold: 0.5,
      hiddenExchanges: [2],
      sort: 'profitVolume',
    }

    expect(derivedRows([lowPercent, highPercent, highVolume], query).map((row) => row.opportunityId))
      .toEqual([2])
  })
})
