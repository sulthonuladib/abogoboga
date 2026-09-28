import { Chain as ChainModel } from '@lister/domain'
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

import { ChainLinkListResponse, CryptocurrencyPageResponse, MarketListResponse } from '../../api'
import { coinRoutesUrl } from '../../route'
import { Message } from './message'
import { Model } from './model'
import { FetchChain, FetchCoins, FetchLinks, FetchMarkets, update } from './update'
import { view } from './view'

const fixtureChain = Schema.decodeUnknownSync(ChainModel.json)({
  id: 5,
  name: 'Ethereum',
  code: 'ETH',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
})

const fixtureLinks = Schema.decodeUnknownSync(ChainLinkListResponse)([
  {
    id: 50,
    exchangeCryptocurrencyId: 100,
    chainId: 5,
    exchangeChainCode: 'ERC20',
    exchangeChainName: 'Ethereum',
    withdrawEnabled: true,
    depositEnabled: false,
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2024-01-02T03:04:05.000Z',
  },
  {
    id: 51,
    exchangeCryptocurrencyId: 999,
    chainId: 5,
    exchangeChainCode: 'STALE',
    exchangeChainName: null,
    withdrawEnabled: true,
    depositEnabled: true,
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2024-01-02T03:04:05.000Z',
  },
])

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
  chainId: 5,
  chain: AsyncData.succeed(fixtureChain),
  links: AsyncData.succeed(fixtureLinks),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
}

const failedModel = (detail: string): Model => ({
  chainId: 5,
  chain: AsyncData.fail(detail),
  links: AsyncData.succeed(fixtureLinks),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
})

describe('chain detail', () => {
  test('a loaded chain names its links with flags and counts', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('ETH Ethereum')).toExist(),
      expect(text('Markets')).toExist(),
      expect(text('Exchanges')).toExist(),
      expect(text('Coins')).toExist(),
      expect(role('link', { name: 'BTC' })).toHaveAttr('href', coinRoutesUrl(1)),
      expect(text('BTC/USDT')).toExist(),
      expect(text('ERC20')).toExist(),
      expect(text('enabled')).toExist(),
      expect(text('disabled')).toExist(),
      expect(text('STALE')).toBeAbsent(),
    )
  })

  test('a chain with no links says so and offers the coins list', () => {
    scene(
      { update, view },
      given({
        chainId: 5,
        chain: AsyncData.succeed(fixtureChain),
        links: AsyncData.succeed([]),
        markets: AsyncData.succeed([]),
        coins: AsyncData.succeed(fixtureCoins),
      }),
      expect(text('No markets on this chain')).toExist(),
      expect(role('link', { name: 'Browse coins' })).toHaveAttr('href', '/coins'),
    )
  })

  test('a missing chain reports itself with a way back', () => {
    scene(
      { update, view },
      given(failedModel('the API answered 404')),
      expect(text('Chain not found')).toExist(),
      expect(text('This chain no longer exists. It may have been removed from the chains page.')).toExist(),
      expect(role('link', { name: 'Back to chains' })).toHaveAttr('href', '/chains'),
      expect(role('alert')).toBeAbsent(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given(failedModel('could not reach the API. Check that the control plane is running.')),
      expect(role('alert')).toExist(),
      expect(text('Could not load chain')).toExist(),
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
        FetchChain({ chainId: 5 }),
        Message.SettledFetchChain({ result: Result.succeed(fixtureChain) }),
      ),
      Command.resolve(
        FetchLinks({ chainId: 5 }),
        Message.SettledFetchLinks({ result: Result.succeed(fixtureLinks) }),
      ),
      Command.resolve(
        FetchMarkets(),
        Message.SettledFetchMarkets({ result: Result.succeed(fixtureMarkets) }),
      ),
      Command.resolve(
        FetchCoins(),
        Message.SettledFetchCoins({ result: Result.succeed(fixtureCoins) }),
      ),
      expect(text('ETH Ethereum')).toExist(),
      expect(text('Could not load chain')).toBeAbsent(),
    )
  })

  test('a page that never loaded says so', () => {
    scene(
      { update, view },
      given({
        chainId: 5,
        chain: AsyncData.Idle(),
        links: AsyncData.Idle(),
        markets: AsyncData.Idle(),
        coins: AsyncData.Idle(),
      }),
      expect(text('Loading chain.')).toExist(),
      expect(role('status', { name: 'Loading rows' })).toExist(),
    )
  })
})
