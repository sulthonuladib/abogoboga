import { Dialog } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { ChainPageResponse, CryptocurrencyMetadataResponse, ExchangePageResponse } from '../../api'
import { Message, OutMessage } from './message'
import { initFor } from './model'
import {
  AddChainLink,
  AssignMarket,
  CreateChain,
  FetchLinkChains,
  FetchMetadata,
  RemoveChainLink,
  SaveMarket,
  ToggleChainLink,
  UnassignMarket,
  init,
  showCoin,
  statusOf,
  update,
  viableFor,
} from './update'

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
  chains: [],
  ...overrides,
})

const metadataWith = (exchanges: ReadonlyArray<Record<string, unknown>>) =>
  Schema.decodeUnknownSync(CryptocurrencyMetadataResponse)({
    ...baseCoin,
    exchanges,
  })

const fullMetadata = metadataWith([
  marketOn({ chains: [linkOn({}), linkOn({ linkId: 51 })] }),
  marketOn({
    id: 11,
    name: 'Indodax',
    slug: 'indodax',
    symbol: 'BTC/IDR',
    marketId: 101,
    chains: [linkOn({ linkId: 52 })],
  }),
])

const oneWayMetadata = metadataWith([
  marketOn({ chains: [linkOn({ withdrawEnabled: true, depositEnabled: false })] }),
  marketOn({
    id: 11,
    name: 'Indodax',
    slug: 'indodax',
    symbol: 'BTC/IDR',
    marketId: 101,
    chains: [linkOn({ linkId: 52, withdrawEnabled: false, depositEnabled: true })],
  }),
])

const blockedMetadata = metadataWith([
  marketOn({ chains: [linkOn({})] }),
  marketOn({
    id: 11,
    name: 'Indodax',
    slug: 'indodax',
    symbol: 'BTC/IDR',
    marketId: 101,
    chains: [],
  }),
])

describe('matrix derivation', () => {
  test('a pair that carries both ways is full', () => {
    expect(statusOf(fullMetadata, 100, 101)).toBe('full')
    expect(viableFor(fullMetadata, 100, 101)).toEqual([5])
  })

  test('a pair that carries one way reports the direction', () => {
    expect(statusOf(oneWayMetadata, 100, 101)).toBe('one-way-other')
    expect(statusOf(oneWayMetadata, 101, 100)).toBe('one-way-blocked')
    expect(viableFor(oneWayMetadata, 100, 101)).toEqual([5])
    expect(viableFor(oneWayMetadata, 101, 100)).toEqual([])
  })

  test('a pair with no shared chain is blocked', () => {
    expect(statusOf(blockedMetadata, 100, 101)).toBe('none')
    expect(viableFor(blockedMetadata, 100, 101)).toEqual([])
  })
})

describe('init', () => {
  test('without a seed the metadata loads', () => {
    const started = init(1, Option.none())

    expect(AsyncData.isLoading(started.model.metadata)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([FetchMetadata.name])
  })

  test('with a seed nothing fetches', () => {
    const started = init(1, Option.some({ metadata: AsyncData.succeed(fullMetadata) }))

    expect(AsyncData.isSuccess(started.model.metadata)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('showCoin', () => {
  test('a different coin starts over', () => {
    const next = showCoin(initFor(1), 2)

    expect(next.model.coinId).toBe(2)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchMetadata.name])
  })
})

describe('update', () => {
  test('a settled fetch fills the page', () => {
    story(
      update,
      given(initFor(1)),
      message(Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.metadata)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('assigning a market closes the dialog, re-reads, and re-reads the rail', () => {
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

    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        assignDialog: () => Dialog.open(Dialog.init({ id: 'coin-routes-assign' })).model,
        assignExchanges: () => AsyncData.succeed(fixtureExchanges),
      })),
      message(Message.PickedAssignExchange({ id: 12, name: 'Kucoin', slug: 'kucoin' })),
      message(Message.UpdatedAssignSymbol({ value: 'BTC/USDT' })),
      message(Message.ClickedConfirmAssign()),
      model((next) => {
        expect(next.isSaving).toBe(true)
      }),
      Command.resolve(
        AssignMarket({
          exchangeId: 12,
          cryptocurrencyId: 1,
          exchangeSymbol: 'BTC/USDT',
          listed: true,
          tradeEnabled: true,
        }),
        Message.SucceededAssign({ exchangeSymbol: 'BTC/USDT' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-assign' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused assign keeps the dialog open with the reason', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        assignDialog: () => Dialog.open(Dialog.init({ id: 'coin-routes-assign' })).model,
        assignExchange: () => Option.some({ id: 12, name: 'Kucoin', slug: 'kucoin' }),
        assignSymbol: () => FieldValidation.Valid({ value: 'BTC/USDT' }),
      })),
      message(Message.ClickedConfirmAssign()),
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
      model((next) => {
        expect(next.assignDialog.isOpen).toBe(true)
        expect(next.notice).toEqual(Option.some('that coin is already assigned to the exchange'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an edit re-reads and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        editDialog: () => Dialog.open(Dialog.init({ id: 'coin-routes-edit' })).model,
        editing: () => Option.some({ marketId: 100, exchangeId: 10, name: 'Binance', symbol: 'BTC/USDT' }),
        editSymbol: () => FieldValidation.Valid({ value: 'BTCUSDT' }),
      })),
      message(Message.ClickedConfirmEdit()),
      Command.resolve(
        SaveMarket({ marketId: 100, exchangeId: 10, cryptocurrencyId: 1, exchangeSymbol: 'BTCUSDT', listed: true, tradeEnabled: true }),
        Message.SucceededEdit(),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-edit' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })

  test('confirming an unassign removes the market and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        unassignDialog: () => Dialog.open(Dialog.init({ id: 'coin-routes-unassign' })).model,
        unassigning: () =>
          Option.some({ marketId: 100, exchangeId: 10, name: 'Binance', symbol: 'BTC/USDT' }),
      })),
      message(Message.ClickedConfirmUnassign()),
      Command.resolve(
        UnassignMarket({ marketId: 100 }),
        Message.SucceededUnassign(),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-unassign' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })

  test('toggling a flag re-reads the matrix', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        managing: () =>
          Option.some({ marketId: 100, exchangeId: 10, name: 'Binance', symbol: 'BTC/USDT' }),
      })),
      message(
        Message.ClickedToggleLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          withdrawEnabled: false,
          depositEnabled: true,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
        }),
      ),
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
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })

  test('a toggle flips the row at once and rolls back when the write fails', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        managing: () =>
          Option.some({ marketId: 100, exchangeId: 10, name: 'Binance', symbol: 'BTC/USDT' }),
      })),
      message(
        Message.ClickedToggleLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          withdrawEnabled: false,
          depositEnabled: true,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
        }),
      ),
      model((next) => {
        expect(next.pendingToggles).toEqual([
          { linkId: 50, withdrawEnabled: false, depositEnabled: true },
        ])
      }),
      Command.resolve(
        ToggleChainLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          withdrawEnabled: false,
          depositEnabled: true,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
        }),
        Message.FailedToggleLink({ linkId: 50, detail: 'that chain link no longer exists' }),
      ),
      model((next) => {
        expect(next.pendingToggles).toEqual([])
        expect(next.linksNotice).toEqual(Option.some('that chain link no longer exists'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a successful toggle clears the pending row when the matrix lands', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        managing: () =>
          Option.some({ marketId: 100, exchangeId: 10, name: 'Binance', symbol: 'BTC/USDT' }),
      })),
      message(
        Message.ClickedToggleLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          withdrawEnabled: false,
          depositEnabled: true,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
        }),
      ),
      Command.resolve(
        ToggleChainLink({
          marketId: 100,
          chainId: 5,
          linkId: 50,
          withdrawEnabled: false,
          depositEnabled: true,
          exchangeChainCode: 'ERC20',
          exchangeChainName: 'Ethereum',
        }),
        Message.SucceededToggleLink(),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      model((next) => {
        expect(next.pendingToggles).toEqual([])
      }),
      Command.expectNone(),
    )
  })

  test('confirming an unlink removes the link and re-reads', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        unlinkDialog: () => Dialog.open(Dialog.init({ id: 'coin-routes-unlink' })).model,
        removingLink: () => Option.some({ linkId: 50, code: 'ETH' }),
      })),
      message(Message.ClickedConfirmUnlink()),
      Command.resolve(
        RemoveChainLink({ linkId: 50 }),
        Message.SucceededUnlink(),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-routes-unlink' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })

  test('creating the typed chain selects it for linking', () => {
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

    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        linkSearch: () => 'SOL',
      })),
      message(Message.ClickedCreateChain()),
      Command.resolve(
        CreateChain({ name: 'SOL', code: 'SOL' }),
        Message.CreatedLinkChain({ id: 9, code: 'SOL', name: 'SOL' }),
      ),
      Command.resolve(
        FetchLinkChains({ search: 'SOL' }),
        Message.SettledFetchLinkChains({ result: Result.succeed(emptyChains) }),
      ),
      model((next) => {
        expect(next.linkChain).toEqual(Option.some({ id: 9, code: 'SOL', name: 'SOL' }))
      }),
      expectNoOutMessage(),
    )
  })

  test('creating a chain normalizes the typed text into a code and a name', () => {
    story(
      update,
      given(modifyFields(initFor(1), { linkSearch: () => 'solana' })),
      message(Message.ClickedCreateChain()),
      Command.resolve(
        CreateChain({ name: 'Solana', code: 'SOLANA' }),
        Message.CreatedLinkChain({ id: 9, code: 'SOLANA', name: 'Solana' }),
      ),
      Command.resolve(
        FetchLinkChains({ search: 'solana' }),
        Message.SettledFetchLinkChains({ result: Result.fail('unreachable') }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('adding a link re-reads the matrix', () => {
    story(
      update,
      given(modifyFields(initFor(1), {
        metadata: () => AsyncData.succeed(fullMetadata),
        managing: () =>
          Option.some({ marketId: 101, exchangeId: 11, name: 'Indodax', symbol: 'BTC/IDR' }),
        linkChain: () => Option.some({ id: 5, code: 'ETH', name: 'Ethereum' }),
        linkCode: () => FieldValidation.Valid({ value: 'ERC20' }),
      })),
      message(Message.ClickedAddLink()),
      Command.resolve(
        AddChainLink({
          marketId: 101,
          chainId: 5,
          exchangeChainName: 'Ethereum',
          exchangeChainCode: 'ERC20',
          withdrawEnabled: true,
          depositEnabled: true,
        }),
        Message.SucceededAddLink({ code: 'ERC20' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        FetchMetadata({ coinId: 1 }),
        Message.SettledFetchMetadata({ result: Result.succeed(fullMetadata) }),
      ),
      Command.expectNone(),
    )
  })
})
