import { Chain as ChainModel } from '@lister/domain'
import { Option, Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { ChainLinkListResponse, CryptocurrencyPageResponse, MarketListResponse } from '../../api'
import { Message } from './message'
import { initFor } from './model'
import { FetchChain, FetchCoins, FetchLinks, FetchMarkets, init, showChain, update } from './update'

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

describe('init', () => {
  test('without a seed every read loads', () => {
    const started = init(5, Option.none())

    expect(AsyncData.isLoading(started.model.chain)).toBe(true)
    expect(AsyncData.isLoading(started.model.links)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([
      FetchChain.name,
      FetchLinks.name,
      FetchMarkets.name,
      FetchCoins.name,
    ])
  })

  test('with a seed nothing fetches', () => {
    const started = init(5, Option.some({
      chain: AsyncData.succeed(fixtureChain),
      links: AsyncData.succeed(fixtureLinks),
      markets: AsyncData.succeed(fixtureMarkets),
      coins: AsyncData.succeed(fixtureCoins),
    }))

    expect(AsyncData.isSuccess(started.model.chain)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('showChain', () => {
  test('a different chain starts over', () => {
    const next = showChain(initFor(5), 6)

    expect(next.model.chainId).toBe(6)
    expect(next.commands?.map((command) => command.name)).toEqual([
      FetchChain.name,
      FetchLinks.name,
      FetchMarkets.name,
      FetchCoins.name,
    ])
  })

  test('the same chain on a loaded page fetches nothing', () => {
    const loaded = {
      ...initFor(5),
      chain: AsyncData.succeed(fixtureChain),
      links: AsyncData.succeed(fixtureLinks),
      markets: AsyncData.succeed(fixtureMarkets),
      coins: AsyncData.succeed(fixtureCoins),
    }

    const next = showChain(loaded, 5)

    expect(next.commands ?? []).toEqual([])
  })
})

describe('update', () => {
  test('each settled read fills its slot', () => {
    story(
      update,
      given(initFor(5)),
      message(Message.SettledFetchChain({ result: Result.succeed(fixtureChain) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.chain)).toBe(true)
      }),
      message(Message.SettledFetchLinks({ result: Result.succeed(fixtureLinks) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.links)).toBe(true)
      }),
      message(Message.SettledFetchMarkets({ result: Result.succeed(fixtureMarkets) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.markets)).toBe(true)
      }),
      message(Message.SettledFetchCoins({ result: Result.succeed(fixtureCoins) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.coins)).toBe(true)
      }),
    )
  })

  test('a failed chain read keeps its reason', () => {
    story(
      update,
      given(initFor(5)),
      message(Message.SettledFetchChain({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.chain)).toBe(true)
      }),
    )
  })

  test('retrying re-reads every idle slot', () => {
    const failed = {
      ...initFor(5),
      chain: AsyncData.fail('unreachable'),
      links: AsyncData.succeed(fixtureLinks),
      markets: AsyncData.succeed(fixtureMarkets),
      coins: AsyncData.succeed(fixtureCoins),
    }

    story(
      update,
      given(failed),
      message(Message.ClickedRetry()),
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
      model((next) => {
        expect(AsyncData.isSuccess(next.chain)).toBe(true)
      }),
    )
  })
})
