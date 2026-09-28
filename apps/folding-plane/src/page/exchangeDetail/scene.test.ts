import { Exchange as ExchangeModel } from '@lister/domain'
import { Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import {
  Command,
  click,
  expect,
  given,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { CryptocurrencyPageResponse, MarketListResponse } from '../../api'
import { coinRoutesUrl } from '../../route'
import { Message } from './message'
import { Model } from './model'
import { FetchCoins, FetchExchange, FetchMarkets, update } from './update'
import { view } from './view'

const fixtureExchange = Schema.decodeUnknownSync(ExchangeModel.json)({
  id: 10,
  coingeckoId: 'binance',
  name: 'Binance',
  slug: 'binance',
  logo: '',
  registeredOnCmc: true,
  baseCurrency: 'usdt',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
})

const fixtureMarkets = Schema.decodeUnknownSync(MarketListResponse)([
  {
    id: 100,
    exchangeId: 10,
    cryptocurrencyId: 1,
    exchangeSymbol: 'BTC/USDT',
    listed: true,
    tradeEnabled: true,
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2024-01-02T03:04:05.000Z',
  },
  {
    id: 101,
    exchangeId: 10,
    cryptocurrencyId: 2,
    exchangeSymbol: 'ETH/USDT',
    listed: false,
    tradeEnabled: false,
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2024-01-02T03:04:05.000Z',
  },
])

const fixtureCoins = Schema.decodeUnknownSync(CryptocurrencyPageResponse)({
  data: [
    {
      id: 1,
      name: 'Bitcoin',
      symbol: 'BTC',
      slug: 'bitcoin',
      logo: '',
      coingeckoId: 'bitcoin',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
    },
  ],
  meta: {
    items: 1,
    pages: 1,
    page: 1,
    limit: -1,
    from: 1,
    to: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'coingeckoId',
  },
})

const loadedModel: Model = {
  exchangeId: 10,
  exchange: AsyncData.succeed(fixtureExchange),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
}

const failedModel = (detail: string): Model => ({
  exchangeId: 10,
  exchange: AsyncData.fail(detail),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
})

describe('exchange detail', () => {
  test('a loaded exchange names its markets and their coins', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('Binance')).toExist(),
      expect(text('Base currency USDT. CoinGecko id binance. Registered on CoinMarketCap.')).toExist(),
      expect(text('Markets listed')).toExist(),
      expect(text('Trade enabled')).toExist(),
      expect(text('Assigned coins')).toExist(),
      expect(role('link', { name: 'BTC Bitcoin' })).toHaveAttr('href', coinRoutesUrl(1)),
      expect(text('BTC/USDT')).toExist(),
      expect(text('listed')).toExist(),
      expect(text('enabled')).toExist(),
      expect(text('Coin #2')).toExist(),
    )
  })

  test('an exchange with no markets says so and offers the coins list', () => {
    scene(
      { update, view },
      given({
        exchangeId: 10,
        exchange: AsyncData.succeed(fixtureExchange),
        markets: AsyncData.succeed([]),
        coins: AsyncData.succeed(fixtureCoins),
      }),
      expect(text('No markets yet')).toExist(),
      expect(text('Assign a coin to this exchange from the coin routes page, then its markets appear here.')).toExist(),
      expect(role('link', { name: 'Browse coins' })).toHaveAttr('href', '/coins'),
    )
  })

  test('a missing exchange reports itself with a way back', () => {
    scene(
      { update, view },
      given(failedModel('the API answered 404')),
      expect(text('Exchange not found')).toExist(),
      expect(text('This exchange no longer exists. It may have been removed from the exchanges page.')).toExist(),
      expect(role('link', { name: 'Back to exchanges' })).toHaveAttr('href', '/exchanges'),
      expect(role('alert')).toBeAbsent(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given(failedModel('could not reach the API. Check that the control plane is running.')),
      expect(role('alert')).toExist(),
      expect(text('Could not load exchange')).toExist(),
      expect(text('could not reach the API. Check that the control plane is running.')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('retrying a failed read fills the page', () => {
    scene(
      { update, view },
      given(failedModel('unreachable')),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchExchange({ exchangeId: 10 }),
        Message.SettledFetchExchange({ result: Result.succeed(fixtureExchange) }),
      ),
      Command.resolve(
        FetchMarkets({ exchangeId: 10 }),
        Message.SettledFetchMarkets({ result: Result.succeed(fixtureMarkets) }),
      ),
      Command.resolve(
        FetchCoins(),
        Message.SettledFetchCoins({ result: Result.succeed(fixtureCoins) }),
      ),
      expect(text('Binance')).toExist(),
      expect(text('Could not load exchange')).toBeAbsent(),
    )
  })

  test('a missing coin index still renders the markets without names', () => {
    scene(
      { update, view },
      given({
        exchangeId: 10,
        exchange: AsyncData.succeed(fixtureExchange),
        markets: AsyncData.succeed(fixtureMarkets),
        coins: AsyncData.fail('unreachable'),
      }),
      expect(role('alert')).toExist(),
      expect(text('Could not load exchange')).toExist(),
    )
  })

  test('a page that never loaded says so', () => {
    scene(
      { update, view },
      given({
        exchangeId: 10,
        exchange: AsyncData.Idle(),
        markets: AsyncData.Idle(),
        coins: AsyncData.Idle(),
      }),
      expect(text('Loading exchange.')).toExist(),
      expect(role('status', { name: 'Loading rows' })).toExist(),
    )
  })
})
