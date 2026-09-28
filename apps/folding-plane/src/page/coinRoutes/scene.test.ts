import { Dialog } from '@foldkit/ui'
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
  ExchangePageResponse,
} from '../../api'
import { Message } from './message'
import { Model, initFor } from './model'
import {
  AddChainLink,
  AssignMarket,
  CreateChain,
  FetchAssignExchanges,
  FetchLinkChains,
  FetchMetadata,
  RemoveChainLink,
  SaveMarket,
  ToggleChainLink,
  UnassignMarket,
  update,
} from './update'
import { view } from './view'

const baseCoin = {
  id: 1,
  name: 'Bitcoin',
  symbol: 'BTC',
  slug: 'bitcoin',
  logo: '',
  coingeckoId: 'bitcoin',
  createdAt: '2024-01-02T03:04:05.000Z',
  updatedAt: '2024-01-02T03:04:05.000Z',
}

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

const marketOn = (overrides: Record<string, unknown>) => ({
  id: 10,
  name: 'Binance',
  slug: 'binance',
  symbol: 'BTC/USDT',
  marketId: 100,
  listed: true,
  tradeEnabled: true,
  chains: [linkOn({})],
  ...overrides,
})

const fixtureMetadata = Schema.decodeUnknownSync(CryptocurrencyMetadataResponse)({
  ...baseCoin,
  exchanges: [
    marketOn({}),
    marketOn({
      id: 11,
      name: 'Indodax',
      slug: 'indodax',
      symbol: 'BTC/IDR',
      marketId: 101,
      tradeEnabled: false,
      chains: [linkOn({ linkId: 52 })],
    }),
  ],
})

const singleMetadata = Schema.decodeUnknownSync(CryptocurrencyMetadataResponse)({
  ...baseCoin,
  exchanges: [marketOn({})],
})

const emptyMetadata = Schema.decodeUnknownSync(CryptocurrencyMetadataResponse)({
  ...baseCoin,
  exchanges: [],
})

const fixtureExchanges = Schema.decodeUnknownSync(ExchangePageResponse)({
  data: [
    {
      id: 12,
      coingeckoId: 'kucoin',
      name: 'Kucoin',
      slug: 'kucoin',
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
  ...initFor(1),
  metadata: AsyncData.succeed(fixtureMetadata),
}

const resolveDialogOpen = [
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe('coin routes', () => {
  test('the market list links each exchange with flags and chain badges', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('BTC routes')).toExist(),
      expect(role('link', { name: 'Binance' })).toHaveAttr('href', '/exchanges/10'),
      expect(role('link', { name: 'Indodax' })).toHaveAttr('href', '/exchanges/11'),
      expect(text('BTC/USDT')).toExist(),
      expect(text('listed')).toExist(),
      expect(text('trading')).toExist(),
      expect(text('disabled')).toExist(),
      expect(text('ETH')).toExist(),
      expect(role('button', { name: 'Manage chains for Binance' })).toExist(),
      expect(role('button', { name: 'Edit Binance market' })).toExist(),
      expect(role('button', { name: 'Unassign Binance' })).toExist(),
    )
  })

  test('a coin with no markets invites the first assignment', () => {
    scene(
      { update, view },
      given({ ...initFor(1), metadata: AsyncData.succeed(emptyMetadata) }),
      expect(text('No markets yet. Assign this coin to an exchange to start.')).toExist(),
    )
  })

  test('the matrix names each pair status and the detail names its chains', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(text('Transfer matrix')).toExist(),
      expect(role('button', { name: 'Route from Binance to Indodax: full' })).toExist(),
      click(role('button', { name: 'Route from Binance to Indodax: full' })),
      ...resolveDialogOpen,
      expect(text('Binance → Indodax')).toExist(),
      expect(text('full')).toExist(),
      expect(text('carries value')).toExist(),
    )
  })

  test('a single market has no matrix', () => {
    scene(
      { update, view },
      given({ ...initFor(1), metadata: AsyncData.succeed(singleMetadata) }),
      expect(text('One more market is needed before routes can be compared.')).toExist(),
    )
  })

  test('the assign dialog picks an exchange and validates the symbol', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Assign market' })),
      Command.resolve(
        FetchAssignExchanges({ search: '' }),
        Message.SettledFetchAssignExchanges({ result: Result.succeed(fixtureExchanges) }),
      ),
      ...resolveDialogOpen,
      expect(text('Assign market')).toExist(),
      expect(role('option', { name: 'Kucoin kucoin' })).toExist(),
      click(role('option', { name: 'Kucoin kucoin' })),
      expect(role('button', { name: 'Confirm assign' })).toBeDisabled(),
      type(role('textbox', { name: 'Exchange symbol' }), 'BTC/USDT'),
      expect(role('button', { name: 'Confirm assign' })).toBeEnabled(),
    )
  })

  test('a refused assign keeps the reason', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Assign market' })),
      Command.resolve(
        FetchAssignExchanges({ search: '' }),
        Message.SettledFetchAssignExchanges({ result: Result.succeed(fixtureExchanges) }),
      ),
      ...resolveDialogOpen,
      click(role('option', { name: 'Kucoin kucoin' })),
      type(role('textbox', { name: 'Exchange symbol' }), 'BTC/USDT'),
      click(role('button', { name: 'Confirm assign' })),
      Command.resolve(
        AssignMarket({
          exchangeId: 12,
          cryptocurrencyId: 1,
          exchangeSymbol: 'BTC/USDT',
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
      click(role('button', { name: 'Edit Binance market' })),
      ...resolveDialogOpen,
      expect(text('Edit Binance market')).toExist(),
      click(role('button', { name: 'Save market' })),
      Command.resolve(
        SaveMarket({ marketId: 100, exchangeId: 10, cryptocurrencyId: 1, exchangeSymbol: 'BTC/USDT', listed: true, tradeEnabled: true }),
        Message.SucceededEdit(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-edit' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Edit Binance market')).toBeAbsent(),
    )
  })

  test('unassigning states what it removes', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Unassign Binance' })),
      ...resolveDialogOpen,
      expect(text('Unassign Binance?')).toExist(),
      expect(role('dialog', { name: 'Unassign Binance?' })).toHaveAttr('data-size', 'sm'),
      expect(text('Binance no longer lists BTC/USDT. Re-assigning restores the market without its chain links.')).toExist(),
      click(role('button', { name: 'Unassign market' })),
      Command.resolve(
        UnassignMarket({ marketId: 100 }),
        Message.SucceededUnassign(),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-unassign' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Unassign Binance?')).toBeAbsent(),
    )
  })

  test('the chain-links dialog toggles flags and offers the unlink', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Manage chains for Binance' })),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      expect(text('Chains for Binance')).toExist(),
      expect(role('dialog', { name: 'Chains for Binance' })).toHaveAttr('data-size', 'lg'),
      expect(text('Ethereum (exchange code ERC20)')).toExist(),
      expect(role('button', { name: 'Link another chain' })).toExist(),
      expect(role('searchbox', { name: 'Search chains' })).toBeAbsent(),
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

  test('the chain picker creates the typed chain', () => {
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
      click(role('button', { name: 'Manage chains for Binance' })),
      Command.resolve(
        FetchLinkChains({ search: '' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(fixtureChains) }),
      ),
      ...resolveDialogOpen,
      expect(role('searchbox', { name: 'Search chains' })).toBeAbsent(),
      click(role('button', { name: 'Link another chain' })),
      expect(role('searchbox', { name: 'Search chains' })).toExist(),
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
      click(role('button', { name: 'Manage chains for Binance' })),
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
        Dialog.CloseDialog({ id: 'coin-routes-unlink' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
    )
  })

  test('a missing coin reports itself with a way back', () => {
    scene(
      { update, view },
      given({ ...initFor(1), metadata: AsyncData.fail('the API answered 404') }),
      expect(text('Coin not found')).toExist(),
      expect(role('link', { name: 'Back to coins' })).toExist(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given({ ...initFor(1), metadata: AsyncData.fail('unreachable') }),
      expect(role('alert')).toExist(),
      expect(text('Could not load routes')).toExist(),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fixtureMetadata) }),
      ),
      expect(text('BTC routes')).toExist(),
    )
  })
})
