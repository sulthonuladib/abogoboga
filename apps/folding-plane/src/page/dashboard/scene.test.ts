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
  withViewInputs,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { CryptocurrencyStatsPageResponse } from '../../api'
import { Coverage } from '../../coverage'
import { coinRoutesUrl } from '../../route'
import { Message } from './message'
import { initialModel } from './model'
import { FetchBlocked, FetchThin, update } from './update'
import { view } from './view'

const figures = Coverage.make({
  coins: 42,
  exchanges: 7,
  chains: 5,
  markets: 31,
  runningWorkers: 2,
  totalWorkers: 3,
  reconnectingShards: 1,
})

const statsPage = Schema.decodeUnknownSync(CryptocurrencyStatsPageResponse)({
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

const emptyPage = Schema.decodeUnknownSync(CryptocurrencyStatsPageResponse)({
  data: [],
  meta: {
    items: 0,
    pages: 0,
    page: 1,
    limit: 5,
    from: 0,
    to: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'desc',
    orderBy: 'blocked',
  },
})

const loadedModel = modifyFields(initialModel, {
  blocked: () => AsyncData.succeed(statsPage),
  thin: () => AsyncData.succeed(statsPage),
})

const dashboardView = withViewInputs(view, { coverage: AsyncData.succeed(figures) })
const pendingCoverageView = withViewInputs(view, { coverage: AsyncData.Idle() })

describe('stat strips', () => {
  test('figures render instead of placeholders', () => {
    scene(
      { update, view: dashboardView() },
      given(loadedModel),
      expect(text('Coins')).toExist(),
      expect(text('42')).toExist(),
      expect(text('Exchanges')).toExist(),
      expect(text('7')).toExist(),
      expect(text('Chains')).toExist(),
      expect(text('5')).toExist(),
      expect(text('Markets')).toExist(),
      expect(text('31')).toExist(),
      expect(text('Workers running')).toExist(),
      expect(text('2/3')).toExist(),
      expect(text('Reconnecting shards')).toExist(),
      expect(text('1')).toExist(),
    )
  })

  test('figures stay pending until coverage settles', () => {
    scene(
      { update, view: pendingCoverageView() },
      given(loadedModel),
      expect(text('…')).toExist(),
    )
  })
})

describe('shortlists', () => {
  test('blocked rows link to the coin with their counts', () => {
    scene(
      { update, view: dashboardView() },
      given(loadedModel),
      expect(text('Blocked routes')).toExist(),
      expect(role('link', { name: 'BTC' })).toHaveAttr('href', coinRoutesUrl(1)),
      expect(text('2')).toExist(),
      expect(text('thin')).toExist(),
      expect(text('Thin coverage')).toExist(),
      expect(role('link', { name: 'ETH' })).toHaveAttr('href', coinRoutesUrl(2)),
    )
  })

  test('empty shortlists say so', () => {
    scene(
      { update, view: dashboardView() },
      given(modifyFields(initialModel, {
        blocked: () => AsyncData.succeed(emptyPage),
        thin: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No blocked routes')).toExist(),
      expect(text('No thin coverage')).toExist(),
    )
  })

  test('loading shortlists hold their tables', () => {
    scene(
      { update, view: dashboardView() },
      given(initialModel),
      expect(role('status')).toExist(),
      expect(text('Loading…')).toExist(),
    )
  })

  test('a failed blocked read shows the reason with a retry', () => {
    scene(
      { update, view: dashboardView() },
      given(modifyFields(initialModel, {
        blocked: () => AsyncData.fail('could not reach the API. Check that the control plane is running.'),
      })),
      expect(text('Could not load blocked routes')).toExist(),
      expect(text('could not reach the API. Check that the control plane is running.')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('a failed thin read shows the reason with a retry', () => {
    scene(
      { update, view: dashboardView() },
      given(modifyFields(initialModel, {
        thin: () => AsyncData.fail('could not reach the API. Check that the control plane is running.'),
      })),
      expect(text('Could not load thin coverage')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('retrying a failed shortlist re-reads it', () => {
    scene(
      { update, view: dashboardView() },
      given(modifyFields(initialModel, {
        blocked: () => AsyncData.fail('unreachable'),
      })),
      click(role('button', { name: 'Retry' })),
      Command.resolve(FetchBlocked, Message.SettledFetchBlocked({ result: Result.fail('unreachable') })),
      expect(text('Could not load blocked routes')).toExist(),
    )
  })

  test('resolving the thin fetch fills the list', () => {
    scene(
      { update, view: dashboardView() },
      given(modifyFields(initialModel, {
        thin: () => AsyncData.fail('unreachable'),
      })),
      click(role('button', { name: 'Retry' })),
      Command.resolve(FetchThin, Message.SettledFetchThin({ result: Result.succeed(statsPage) })),
      expect(role('link', { name: 'ETH' })).toExist(),
    )
  })
})
