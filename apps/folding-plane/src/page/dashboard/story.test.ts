import { Option, Result } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, expectNoOutMessage, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { CryptocurrencyStatsPageResponse } from '../../api'
import { Schema } from 'effect'
import { Message } from './message'
import { FetchBlocked, FetchThin, entered, init, update } from './update'
import { initialModel } from './model'

const fixturePage = Schema.decodeUnknownSync(CryptocurrencyStatsPageResponse)({
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
      markets: 3,
      chains: 2,
      blocked: 2,
    },
    {
      id: 2,
      name: 'Ethereum',
      symbol: 'ETH',
      slug: 'ethereum',
      logo: '',
      coingeckoId: 'ethereum',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
      markets: 1,
      chains: 1,
      blocked: 0,
    },
  ],
  meta: {
    items: 2,
    pages: 1,
    page: 1,
    limit: 5,
    from: 1,
    to: 2,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'desc',
    orderBy: 'blocked',
  },
})

const loadedModel = modifyFields(initialModel, {
  blocked: () => AsyncData.succeed(fixturePage),
  thin: () => AsyncData.succeed(fixturePage),
})

describe('init', () => {
  test('without a seed both shortlists load', () => {
    const started = init(Option.none())

    expect(AsyncData.isLoading(started.model.blocked)).toBe(true)
    expect(AsyncData.isLoading(started.model.thin)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([
      FetchBlocked.name,
      FetchThin.name,
    ])
  })

  test('with a seed nothing fetches', () => {
    const started = init(
      Option.some({ blocked: AsyncData.succeed(fixturePage), thin: AsyncData.succeed(fixturePage) }),
    )

    expect(AsyncData.isSuccess(started.model.blocked)).toBe(true)
    expect(AsyncData.isSuccess(started.model.thin)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('entered', () => {
  test('an idle list loads while a settled one is left alone', () => {
    const next = entered(
      modifyFields(initialModel, { thin: () => AsyncData.succeed(fixturePage) }),
    )

    expect(AsyncData.isLoading(next.model.blocked)).toBe(true)
    expect(AsyncData.isSuccess(next.model.thin)).toBe(true)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchBlocked.name])
  })

  test('settled lists fetch nothing', () => {
    expect(entered(loadedModel).commands ?? []).toEqual([])
  })
})

describe('update', () => {
  test('a blocked read settling fills the shortlist', () => {
    story(
      update,
      given(initialModel),
      message(Message.SettledFetchBlocked({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.blocked)).toBe(true)
        expect(AsyncData.isIdle(next.thin)).toBe(true)
      }),
    )
  })

  test('a thin read settling fills the shortlist', () => {
    story(
      update,
      given(initialModel),
      message(Message.SettledFetchThin({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.thin)).toBe(true)
      }),
    )
  })

  test('a failed blocked read keeps its reason', () => {
    story(
      update,
      given(initialModel),
      message(Message.SettledFetchBlocked({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.blocked)).toBe(true)
      }),
    )
  })

  test('a failed thin read keeps its reason', () => {
    story(
      update,
      given(initialModel),
      message(Message.SettledFetchThin({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.thin)).toBe(true)
      }),
    )
  })

  test('retrying a stale blocked list re-reads it', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        blocked: () => AsyncData.Stale({ error: 'stale', data: fixturePage }),
      })),
      message(Message.ClickedRetryBlocked()),
      model((next) => {
        expect(AsyncData.isRefreshing(next.blocked)).toBe(true)
      }),
      Command.resolve(FetchBlocked, Message.SettledFetchBlocked({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.blocked)).toBe(true)
      }),
    )
  })

  test('retrying a stale thin list re-reads it', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        thin: () => AsyncData.Stale({ error: 'stale', data: fixturePage }),
      })),
      message(Message.ClickedRetryThin()),
      model((next) => {
        expect(AsyncData.isRefreshing(next.thin)).toBe(true)
      }),
      Command.resolve(FetchThin, Message.SettledFetchThin({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.thin)).toBe(true)
      }),
    )
  })

  test('retrying a failed blocked list loads it', () => {
    story(
      update,
      given(modifyFields(initialModel, { blocked: () => AsyncData.fail('unreachable') })),
      message(Message.ClickedRetryBlocked()),
      model((next) => {
        expect(AsyncData.isLoading(next.blocked)).toBe(true)
      }),
      Command.resolve(FetchBlocked, Message.SettledFetchBlocked({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.blocked)).toBe(true)
      }),
    )
  })

  test('a retry while loading does nothing', () => {
    story(
      update,
      given(modifyFields(initialModel, { blocked: () => AsyncData.Loading() })),
      message(Message.ClickedRetryBlocked()),
      model((next) => {
        expect(AsyncData.isLoading(next.blocked)).toBe(true)
      }),
      Command.expectNone(),
      // The dashboard never announces upward: reads only, no writes.
      expectNoOutMessage(),
    )
  })
})
