import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { expect, given, role, scene, text, withViewInputs } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { ExchangeJson, type SignalRow } from '../../api'
import { ConnectionState } from '../../connection'
import { defaultSignalsQuery } from '../../route'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'

const row: SignalRow = {
  opportunityId: 1,
  symbol: 'BTC',
  buyExchangeId: 2,
  buyExchangeSymbol: 'BTC/IDR',
  buyPrice: 1_000_000,
  buyVolume: 12_345,
  buyTickTimestamp: 1_000,
  sellExchangeId: 3,
  sellExchangeSymbol: 'BTC/USDT',
  sellPrice: 1_100_000,
  sellVolume: 6_789,
  sellTickTimestamp: 1_000,
  profitPercent: 10,
  profitVolume: 0.2,
}

const decodeExchange = Schema.decodeUnknownSync(ExchangeJson)

const buyExchange = decodeExchange({
  id: 2,
  coingeckoId: 'binance',
  name: 'Binance',
  slug: 'binance',
  logo: 'binance.svg',
  registeredOnCmc: true,
  baseCurrency: 'usdt',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
})

const sellExchange = decodeExchange({
  id: 3,
  coingeckoId: 'indodax',
  name: 'Indodax',
  slug: 'indodax',
  logo: 'indodax.svg',
  registeredOnCmc: false,
  baseCurrency: 'idr',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
})

const loadedModel = {
  ...initialModel,
  rows: [row],
  exchanges: AsyncData.succeed([buyExchange, sellExchange]),
}

const tableModel: typeof loadedModel = {
  ...loadedModel,
  query: { ...defaultSignalsQuery, view: 'table' },
}

const liveView = withViewInputs(view, { connection: ConnectionState.Connected() })
const connectingView = withViewInputs(view, { connection: ConnectionState.Connecting() })

describe('signals view', () => {
  test('an empty page says so and shows the connection state', () => {
    scene(
      { update, view: connectingView() },
      given(initialModel),
      expect(text('No signals yet. Fresh, profitable routes appear as workers tick.')).toExist(),
      expect(text('Connecting')).toExist(),
    )
  })

  test('the top bar carries every control', () => {
    scene(
      { update, view: liveView() },
      given(loadedModel),
      expect(role('button', { name: 'Cards' })).toExist(),
      expect(role('button', { name: 'Table' })).toExist(),
      expect(role('button', { name: 'Profit %' })).toExist(),
      expect(role('button', { name: 'Profit volume' })).toExist(),
      expect(role('spinbutton', { name: 'Minimum profit percent' })).toExist(),
    )
  })

  test('the toolbar toggles each exchange in the cached directory', () => {
    scene(
      { update, view: liveView() },
      given(loadedModel),
      expect(role('checkbox', { name: 'Binance' })).toExist(),
      expect(role('checkbox', { name: 'Indodax' })).toExist(),
    )
  })

  test('a cold load opens on the card view with both sides, prices, volumes, and profit', () => {
    scene(
      { update, view: liveView() },
      given(loadedModel),
      expect(text('Live')).toExist(),
      expect(text('#1')).toExist(),
      expect(text('BTC')).toExist(),
      expect(text('1,000,000')).toExist(),
      expect(text('12,345')).toExist(),
      expect(text('1,100,000')).toExist(),
      expect(text('6,789')).toExist(),
      expect(text('10.00%')).toExist(),
      expect(text('0.2')).toExist(),
      expect(text('USDT → IDR')).toExist(),
      expect(text('Buy price')).toBeAbsent(),
      expect(text('No signals yet. Fresh, profitable routes appear as workers tick.')).toBeAbsent(),
    )
  })

  test('the card view renders both exchange logos from the cached directory', () => {
    scene(
      { update, view: liveView() },
      given(loadedModel),
      expect(role('img', { name: 'Binance' })).toExist(),
      expect(role('img', { name: 'Indodax' })).toExist(),
    )
  })

  test('the table view renders the dense table with each volume beside its price', () => {
    scene(
      { update, view: liveView() },
      given(tableModel),
      expect(text('Buy price')).toExist(),
      expect(text('Buy vol')).toExist(),
      expect(text('Sell price')).toExist(),
      expect(text('Sell vol')).toExist(),
      expect(text('10.00%')).toExist(),
      expect(role('img', { name: 'USDT → IDR' })).toExist(),
      expect(text('#1')).toBeAbsent(),
    )
  })
})
