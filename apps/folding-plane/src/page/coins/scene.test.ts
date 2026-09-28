import { Dialog } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'
import {
  Command,
  Mount,
  change,
  click,
  expect,
  given,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { CryptocurrencyStatsPageResponse, ExchangePageResponse } from '../../api'
import { coinRoutesUrl, coinsUrl, defaultCoinsQuery } from '../../route'
import { Message } from './message'
import { Model, initialModel } from './model'
import {
  AddCoin,
  DeleteCoin,
  FetchCoins,
  FetchScopeExchanges,
  NavigateCoins,
  update,
} from './update'
import { view } from './view'

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
      markets: 4,
      chains: 3,
      blocked: 2,
    },
    {
      id: 2,
      name: 'Lone Coin',
      symbol: 'LONE',
      slug: 'lone-coin',
      logo: '',
      coingeckoId: 'lone-coin',
      createdAt: '2024-01-03T03:04:05.000Z',
      updatedAt: '2024-01-03T03:04:05.000Z',
      markets: 1,
      chains: 1,
      blocked: 0,
    },
  ],
  meta: {
    items: 42,
    pages: 3,
    page: 1,
    limit: 20,
    from: 1,
    to: 2,
    hasNextPage: true,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'symbol',
  },
})

const emptyPage = Schema.decodeUnknownSync(CryptocurrencyStatsPageResponse)({
  data: [],
  meta: {
    items: 0,
    pages: 0,
    page: 1,
    limit: 20,
    from: 0,
    to: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'symbol',
  },
})

const loadedModel: Model = modifyFields(initialModel, {
  query: () => defaultCoinsQuery,
  loadedQuery: () => Option.some(defaultCoinsQuery),
  coins: () => AsyncData.succeed(fixturePage),
})

const resolveDialogOpen = [
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

const fixtureExchanges = Schema.decodeUnknownSync(ExchangePageResponse)({
  data: [
    {
      id: 10,
      coingeckoId: 'binance',
      name: 'Binance',
      slug: 'binance',
      logo: '',
      registeredOnCmc: true,
      baseCurrency: 'usdt',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
    },
  ],
  meta: {
    items: 1,
    pages: 1,
    page: 1,
    limit: 20,
    from: 1,
    to: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'name',
    order: 'asc',
    orderBy: 'name',
  },
})

describe('coins listing', () => {
  test('page numbers are links that mark the current page', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('link', { name: 'Page 2' })).toHaveAttr(
        'href',
        coinsUrl({ ...defaultCoinsQuery, page: 2 }),
      ),
      expect(role('link', { name: 'Page 1' })).toHaveAttr('aria-current', 'page'),
      expect(role('button', { name: 'Page 2' })).toBeAbsent(),
    )
  })

  test('per-row controls keep their accessible names without tooltips', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Edit BTC' })).toHaveAccessibleName('Edit BTC'),
      expect(role('button', { name: 'Remove BTC' })).toHaveAccessibleName('Remove BTC'),
      expect(role('tooltip')).toBeAbsent(),
    )
  })

  test('the table names its columns, links each symbol, and shows coverage', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Sort by Coin, currently ascending' })).toExist(),
      expect(role('button', { name: 'Sort by Markets, currently not sorted' })).toExist(),
      expect(role('button', { name: 'Sort by Chains, currently not sorted' })).toExist(),
      expect(role('button', { name: 'Sort by Blocked, currently not sorted' })).toExist(),
      expect(role('link', { name: 'BTC' })).toHaveAttr('href', coinRoutesUrl(1)),
      expect(role('link', { name: 'LONE' })).toHaveAttr('href', coinRoutesUrl(2)),
      expect(text('Bitcoin')).toExist(),
      expect(text('thin')).toExist(),
      expect(text('2')).toExist(),
    )
  })

  test('an empty catalogue invites the first coin', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultCoinsQuery,
        coins: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No coins yet. Add the first coin, then assign it to exchanges.')).toExist(),
    )
  })

  test('a filtered listing with no rows suggests a different filter', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => ({ ...defaultCoinsQuery, flag: 'blocked' }),
        coins: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No coins match. Try a shorter search or a different coverage filter.')).toExist(),
    )
  })

  test('a search with no rows suggests a shorter one', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => ({ ...defaultCoinsQuery, search: 'zzz' }),
        coins: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No coins match. Try a shorter search or a different coverage filter.')).toExist(),
    )
  })

  test('the coverage filter holds the query value and navigates on change', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('combobox', { name: 'Coverage' })).toExist(),
      expect(role('combobox', { name: 'Coverage' })).toHaveValue('all'),
      expect(text('Blocked routes')).toExist(),
      change(role('combobox', { name: 'Coverage' }), 'blocked'),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, flag: 'blocked', page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
    )
  })

  test('a searched field is a navigation that keeps the others', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('checkbox', { name: 'Slug' })),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, searchBy: ['symbol', 'name', 'slug'], page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
    )
  })

  test('the page size is a navigation that resets to the first page', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('combobox', { name: 'Rows per page' })).toHaveValue('20'),
      change(role('combobox', { name: 'Rows per page' }), '50'),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, limit: 50, page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
    )
  })

  test('scoping to an exchange is a navigation and closes the picker', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Scope' })),
      Command.resolve(
        FetchScopeExchanges({ search: '' }),
        Message.SettledFetchScopeExchanges({ result: Result.succeed(fixtureExchanges) }),
      ),
      ...resolveDialogOpen,
      click(role('option', { name: 'Binance binance' })),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, exchangeId: Option.some(10), page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-scope' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultCoinsQuery,
        coins: () => AsyncData.fail('could not reach the API. Check that the control plane is running.'),
      })),
      expect(role('alert')).toExist(),
      expect(text('Could not load coins')).toExist(),
      expect(text('could not reach the API. Check that the control plane is running.')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('retrying a failed read fills the table', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultCoinsQuery,
        coins: () => AsyncData.fail('unreachable'),
      })),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      expect(text('Bitcoin')).toExist(),
      expect(text('Could not load coins')).toBeAbsent(),
    )
  })

  test('the editor validates before it sends', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New coin' })),
      ...resolveDialogOpen,
      expect(text('New coin')).toExist(),
      expect(role('button', { name: 'Add coin' })).toBeDisabled(),
      type(role('textbox', { name: 'Symbol' }), 'BTC'),
      type(role('textbox', { name: 'Name' }), 'Bitcoin'),
      type(role('textbox', { name: 'Slug' }), 'bitcoin'),
      type(role('textbox', { name: 'CoinGecko id' }), 'bitcoin'),
      expect(role('button', { name: 'Add coin' })).toBeEnabled(),
    )
  })

  test('the editor shows what a refused save reports', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New coin' })),
      ...resolveDialogOpen,
      type(role('textbox', { name: 'Symbol' }), 'BTC'),
      type(role('textbox', { name: 'Name' }), 'Bitcoin'),
      type(role('textbox', { name: 'Slug' }), 'bitcoin'),
      type(role('textbox', { name: 'CoinGecko id' }), 'bitcoin'),
      click(role('button', { name: 'Add coin' })),
      Command.resolve(
        AddCoin({
          name: 'Bitcoin',
          symbol: 'BTC',
          slug: 'bitcoin',
          coingeckoId: 'bitcoin',
          logo: '',
        }),
        Message.FailedSaveCoin({ detail: 'slug is already used by another coin' }),
      ),
      expect(text('New coin')).toExist(),
      expect(text('slug is already used by another coin')).toExist(),
    )
  })

  test('removal states what it unlinks', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove BTC' })),
      ...resolveDialogOpen,
      expect(text('Remove BTC?')).toExist(),
      expect(text('BTC is removed with every market and chain link that names it. Re-adding the coin does not restore those routes.')).toExist(),
      expect(role('button', { name: 'Remove coin' })).toBeEnabled(),
    )
  })

  test('confirming a removal closes the dialog and re-reads', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove BTC' })),
      ...resolveDialogOpen,
      click(role('button', { name: 'Remove coin' })),
      Command.resolve(
        DeleteCoin({ id: 1 }),
        Message.SucceededRemoveCoin({ symbol: 'BTC' }),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Remove BTC?')).toBeAbsent(),
      expect(text('Bitcoin')).toExist(),
    )
  })

  test('editing names the coin on screen', () => {
    scene(
      { update, view },
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
        editing: () => Option.some({ id: 1 }),
        symbol: () => FieldValidation.Valid({ value: 'BTC' }),
        name: () => FieldValidation.Valid({ value: 'Bitcoin' }),
        slug: () => FieldValidation.Valid({ value: 'bitcoin' }),
        coingeckoId: () => FieldValidation.Valid({ value: 'bitcoin' }),
        logo: () => FieldValidation.NotValidated({ value: '' }),
      })),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      expect(text('Edit BTC')).toExist(),
      expect(role('textbox', { name: 'Symbol' })).toHaveValue('BTC'),
      expect(role('textbox', { name: 'Name' })).toHaveValue('Bitcoin'),
      expect(role('textbox', { name: 'Slug' })).toHaveValue('bitcoin'),
      expect(role('textbox', { name: 'CoinGecko id' })).toHaveValue('bitcoin'),
    )
  })
})
