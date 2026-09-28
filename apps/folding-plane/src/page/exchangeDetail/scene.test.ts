import { Dialog } from '@foldkit/ui'
import { Exchange as ExchangeModel } from '@lister/domain'
import { Result, Schema } from 'effect'
import { AsyncData } from 'foldkit'
import {
  Command,
  Mount,
  click,
  expect,
  given,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import {
  ChainPageResponse,
  CryptocurrencyMetadataResponse,
  CryptocurrencyPageResponse,
  MarketListResponse,
} from '../../api'
import { coinRoutesUrl } from '../../route'
import { Message } from './message'
import { Model, initFor } from './model'
import {
  AddChainLink,
  AssignMarket,
  CreateChain,
  FetchCoins,
  FetchExchange,
  FetchLinkChains,
  FetchMarkets,
  FetchMetadata,
  RemoveChainLink,
  SaveMarket,
  ToggleChainLink,
  UnassignMarket,
  update,
} from './update'
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
    {
      id: 2,
      name: 'Ethereum',
      symbol: 'ETH',
      slug: 'ethereum',
      logo: '',
      coingeckoId: 'ethereum',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
    },
  ],
  meta: {
    items: 2,
    pages: 1,
    page: 1,
    limit: -1,
    from: 1,
    to: 2,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'coingeckoId',
  },
})

const linkOn = (overrides: Record<string, unknown>) => ({
  id: 5,
  name: 'Ethereum',
  code: 'ETH',
  linkId: 50,
  exchangeChainCode: 'ERC20',
  exchangeChainName: 'Ethereum',
  withdrawEnabled: true,
  depositEnabled: true,
  ...overrides,
})

const fixtureMetadata = Schema.decodeUnknownSync(CryptocurrencyMetadataResponse)({
  id: 1,
  name: 'Bitcoin',
  symbol: 'BTC',
  slug: 'bitcoin',
  logo: '',
  coingeckoId: 'bitcoin',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
  exchanges: [
    {
      id: 10,
      name: 'Binance',
      slug: 'binance',
      symbol: 'BTC/USDT',
      marketId: 100,
      listed: true,
      tradeEnabled: true,
      chains: [linkOn({})],
    },
  ],
})

const fixtureChains = Schema.decodeUnknownSync(ChainPageResponse)({
  data: [
    {
      id: 5,
      name: 'Ethereum',
      code: 'ETH',
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

const loadedModel: Model = {
  ...initFor(10),
  exchange: AsyncData.succeed(fixtureExchange),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
}

const failedModel = (detail: string): Model => ({
  ...initFor(10),
  exchange: AsyncData.fail(detail),
  markets: AsyncData.succeed(fixtureMarkets),
  coins: AsyncData.succeed(fixtureCoins),
})

const resolveDialogOpen = [
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

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
      expect(role('button', { name: 'Manage chains for BTC' })).toExist(),
      expect(role('button', { name: 'Edit BTC market' })).toExist(),
      expect(role('button', { name: 'Unassign BTC' })).toExist(),
    )
  })

  test('an exchange with no markets says so and offers to assign the first', () => {
    scene(
      { update, view },
      given({ ...initFor(10), exchange: AsyncData.succeed(fixtureExchange), markets: AsyncData.succeed([]), coins: AsyncData.succeed(fixtureCoins) }),
      expect(text('No markets yet')).toExist(),
      expect(text('Assign a coin to this exchange and its market appears here.')).toExist(),
      expect(role('button', { name: 'Assign market' })).toExist(),
    )
  })

  test('the assign dialog picks a coin and validates the symbol', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Assign market' })),
      ...resolveDialogOpen,
      expect(text('Assign market')).toExist(),
      expect(role('option', { name: 'BTC Bitcoin' })).toExist(),
      click(role('option', { name: 'BTC Bitcoin' })),
      expect(role('button', { name: 'Confirm assign' })).toBeDisabled(),
      type(role('textbox', { name: 'Exchange symbol' }), 'BTCUSDT'),
      expect(role('button', { name: 'Confirm assign' })).toBeEnabled(),
    )
  })

  test('a refused assign keeps the reason', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Assign market' })),
      ...resolveDialogOpen,
      click(role('option', { name: 'BTC Bitcoin' })),
      type(role('textbox', { name: 'Exchange symbol' }), 'BTCUSDT'),
      click(role('button', { name: 'Confirm assign' })),
      Command.resolve(
        AssignMarket({
          exchangeId: 10,
          cryptocurrencyId: 1,
          exchangeSymbol: 'BTCUSDT',
          listed: true,
          tradeEnabled: true,
        }),
        Message.FailedAssign({ detail: 'that coin is already assigned to the exchange' }),
      ),
      expect(text('that coin is already assigned to the exchange')).toExist(),
    )
  })

  test('the edit dialog saves the market', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Edit BTC market' })),
      ...resolveDialogOpen,
      expect(text('Edit BTC market')).toExist(),
      click(role('button', { name: 'Save market' })),
      Command.resolve(
        SaveMarket({ marketId: 100, exchangeId: 10, cryptocurrencyId: 1, exchangeSymbol: 'BTC/USDT', listed: true, tradeEnabled: true }),
        Message.SucceededEdit(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-detail-edit' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMarkets({ exchangeId: 10 }),
        Message.SettledFetchMarkets({ result: Result.succeed(fixtureMarkets) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Edit BTC market')).toBeAbsent(),
    )
  })

  test('unassigning states what it removes', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Unassign BTC' })),
      ...resolveDialogOpen,
      expect(text('Unassign BTC?')).toExist(),
      expect(role('dialog', { name: 'Unassign BTC?' })).toHaveAttr('data-size', 'sm'),
      expect(text('This exchange no longer lists BTC under BTC/USDT. Re-assigning restores the market without its chain links.')).toExist(),
      click(role('button', { name: 'Unassign market' })),
      Command.resolve(
        UnassignMarket({ marketId: 100 }),
        Message.SucceededUnassign(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-detail-unassign' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMarkets({ exchangeId: 10 }),
        Message.SettledFetchMarkets({ result: Result.succeed(fixtureMarkets) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Unassign BTC?')).toBeAbsent(),
    )
  })

  test('the chain-links dialog toggles flags and offers the unlink', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Manage chains for BTC' })),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      expect(text('Chains for BTC')).toExist(),
      expect(role('dialog', { name: 'Chains for BTC' })).toHaveAttr('data-size', 'lg'),
      expect(text('Ethereum (exchange code ERC20)')).toExist(),
      expect(role('button', { name: 'Withdraw' })).toHaveAttr('aria-pressed', 'true'),
      click(role('button', { name: 'Withdraw' })),
      expect(role('button', { name: 'Withdraw' })).toHaveAttr('aria-pressed', 'false'),
      Command.resolve(
        ToggleChainLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
          withdrawEnabled: false,
          depositEnabled: true,
        }),
        Message.SucceededToggleLink(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      expect(role('button', { name: 'Unlink ETH' })).toExist(),
    )
  })

  test('a failed toggle restores the flag with the reason', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Manage chains for BTC' })),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      click(role('button', { name: 'Withdraw' })),
      Command.resolve(
        ToggleChainLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
          withdrawEnabled: false,
          depositEnabled: true,
        }),
        Message.FailedToggleLink({ linkId: 50, detail: 'that chain link no longer exists' }),
      ),
      expect(role('button', { name: 'Withdraw' })).toHaveAttr('aria-pressed', 'true'),
      expect(text('that chain link no longer exists')).toExist(),
    )
  })

  test('the chain picker creates the typed chain and adds the link', () => {
    const emptyChains = Schema.decodeUnknownSync(ChainPageResponse)({
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
        search: 'SOL',
        searchBy: 'name',
        order: 'asc',
        orderBy: 'name',
      },
    })

    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Manage chains for BTC' })),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      type(role('searchbox', { name: 'Search chains' }), 'SOL'),
      Command.resolve(
        FetchLinkChains({ search: 'SOL' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(emptyChains) }),
      ),
      expect(role('button', { name: 'Add chain “SOL”' })).toExist(),
      click(role('button', { name: 'Add chain “SOL”' })),
      Command.resolve(
        CreateChain({ name: 'SOL', code: 'SOL' }),
        Message.CreatedLinkChain({ id: 9, code: 'SOL', name: 'SOL' }),
      ),
      Command.resolve(
        FetchLinkChains({ search: 'SOL' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(emptyChains) }),
      ),
      type(role('textbox', { name: 'Exchange chain code' }), 'SPL'),
      click(role('button', { name: 'Add chain link' })),
      Command.resolve(
        AddChainLink({
          marketId: 100,
          chainId: 9,
          exchangeChainName: 'SOL',
          exchangeChainCode: 'SPL',
          withdrawEnabled: true,
          depositEnabled: true,
        }),
        Message.SucceededAddLink({ code: 'SPL' }),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
    )
  })

  test('unlinking confirms before it removes', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Manage chains for BTC' })),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      click(role('button', { name: 'Unlink ETH' })),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      expect(text('Unlink ETH?')).toExist(),
      expect(role('dialog', { name: 'Unlink ETH?' })).toHaveAttr('data-size', 'sm'),
      click(role('button', { name: 'Unlink chain' })),
      Command.resolve(
        RemoveChainLink({ linkId: 50 }),
        Message.SucceededUnlink(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-detail-unlink' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
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
        ...initFor(10),
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
      given(initFor(10)),
      expect(text('Loading exchange.')).toExist(),
      expect(role('status', { name: 'Loading rows' })).toExist(),
    )
  })
})
