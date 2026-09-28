import { Dialog, RadioGroup } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { Interruptible } from 'foldkit/command'
import { AsyncData } from 'foldkit'
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { CryptocurrencyStatsPageResponse } from '../../api'
import { coinsUrl, defaultCoinsQuery } from '../../route'
import { Message, OutMessage } from './message'
import { initialModel } from './model'
import {
  AddCoin,
  DeleteCoin,
  FetchCoins,
  NavigateCoins,
  SaveCoin,
  SearchCoins,
  informRouteChanged,
  init,
  update,
} from './update'

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
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'symbol',
  },
})

const loadedModel = modifyFields(initialModel, {
  query: () => defaultCoinsQuery,
  loadedQuery: () => Option.some(defaultCoinsQuery),
  coins: () => AsyncData.succeed(fixturePage),
})

describe('init', () => {
  test('without a seed the first window loads', () => {
    const started = init(defaultCoinsQuery, Option.none())

    expect(AsyncData.isLoading(started.model.coins)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
  })

  test('with a seed nothing fetches', () => {
    const started = init(defaultCoinsQuery, Option.some(AsyncData.succeed(fixturePage)))

    expect(AsyncData.isSuccess(started.model.coins)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('informRouteChanged', () => {
  test('the same query on a loaded page fetches nothing', () => {
    expect(informRouteChanged(loadedModel, defaultCoinsQuery).commands).toBeUndefined()
  })

  test('the same query on a page that never loaded fetches', () => {
    const next = informRouteChanged(initialModel, defaultCoinsQuery)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
  })

  test('a changed query loads its window', () => {
    const next = informRouteChanged(loadedModel, { ...defaultCoinsQuery, page: 2 })

    expect(AsyncData.isLoading(next.model.coins)).toBe(true)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
  })

  test('a changed flag loads its window', () => {
    const next = informRouteChanged(loadedModel, { ...defaultCoinsQuery, flag: 'blocked' })

    expect(AsyncData.isLoading(next.model.coins)).toBe(true)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
  })
})

describe('update', () => {
  test('typing a search holds the text and waits for the pause', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedSearch({ value: 'bt' })),
      model((next) => {
        expect(next.query.search).toBe('bt')
      }),
      Command.resolve(SearchCoins({ query: { ...defaultCoinsQuery, search: 'bt' } }), Message.CompletedSearchCoins()),
      Command.resolve(
        SearchCoins.Interrupt((outcome) =>
          Message.CompletedInterruptSearchCoins({ outcome })
        ),
        Message.CompletedInterruptSearchCoins({ outcome: Interruptible.Outcome.NotFound() }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a search keeps the current filter and sort and resets the page', () => {
    const filtered = {
      ...defaultCoinsQuery,
      flag: 'blocked' as const,
      sort: 'markets' as const,
      order: 'desc' as const,
      page: 3,
    }
    const target = {
      ...defaultCoinsQuery,
      flag: 'blocked' as const,
      sort: 'markets' as const,
      order: 'desc' as const,
      search: 'bt',
      page: 1,
    }

    story(
      update,
      given(modifyFields(loadedModel, { query: () => filtered })),
      message(Message.UpdatedSearch({ value: 'bt' })),
      model((next) => {
        expect(next.query).toEqual(target)
      }),
      Command.resolve(SearchCoins({ query: target }), Message.CompletedSearchCoins()),
      Command.resolve(
        SearchCoins.Interrupt((outcome) =>
          Message.CompletedInterruptSearchCoins({ outcome })
        ),
        Message.CompletedInterruptSearchCoins({ outcome: Interruptible.Outcome.NotFound() }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a landed search issues exactly one read though the draft already holds the text', () => {
    const typed = update(loadedModel, Message.UpdatedSearch({ value: 'bt' })).model
    const landed = informRouteChanged(typed, { ...defaultCoinsQuery, search: 'bt' })

    expect(landed.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
    expect(AsyncData.isLoading(landed.model.coins)).toBe(true)
  })

  test('a searched-field, scope, or size change is fetched with the new query', () => {
    const query = {
      ...defaultCoinsQuery,
      searchBy: ['slug'] as const,
      exchangeId: Option.some(10),
      chainId: Option.some(5),
      limit: 50,
      page: 2,
    }
    const next = informRouteChanged(loadedModel, query)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchCoins.name])
    expect(next.model.query).toEqual(query)
    expect(AsyncData.isLoading(next.model.coins)).toBe(true)
  })

  test('sorting a new column navigates ascending from the first page', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedSort({ column: 'markets' })),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, sort: 'markets', order: 'asc', page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('sorting the same column twice flips the direction', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        query: () => ({ ...defaultCoinsQuery, sort: 'markets', order: 'asc' }),
      })),
      message(Message.ClickedSort({ column: 'markets' })),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, sort: 'markets', order: 'desc', page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('picking a coverage radio navigates from the first page', () => {
    story(
      update,
      given(loadedModel),
      message(Message.GotCoverageMessage({
        message: RadioGroup.Message.SelectedOption({ index: 1, value: 'blocked' }),
      })),
      Command.resolve(
        RadioGroup.FocusOption({ id: 'coin-coverage', index: 1 }),
        RadioGroup.Message.CompletedFocusOption(),
      ),
      Command.resolve(
        NavigateCoins({
          url: coinsUrl({ ...defaultCoinsQuery, flag: 'blocked', page: 1 }),
        }),
        Message.CompletedNavigateCoins(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a settled fetch fills the table', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        query: () => defaultCoinsQuery,
        coins: () => AsyncData.Loading(),
      })),
      message(Message.SettledFetchCoins({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.coins)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('a failed fetch keeps its reason', () => {
    story(
      update,
      given(modifyFields(initialModel, { coins: () => AsyncData.Loading() })),
      message(Message.SettledFetchCoins({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.coins)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('retrying a stale listing re-reads its window', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        coins: () => AsyncData.Stale({ error: 'stale', data: fixturePage }),
      })),
      message(Message.ClickedRetry()),
      model((next) => {
        expect(AsyncData.isRefreshing(next.coins)).toBe(true)
      }),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      model((next) => {
        expect(AsyncData.isSuccess(next.coins)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('opening the editor starts blank for a new coin', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedNewCoin()),
      model((next) => {
        expect(Option.isNone(next.editing)).toBe(true)
        expect(next.editor.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('opening the editor fills the form for an edit', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedEditCoin({
        id: 1,
        name: 'Bitcoin',
        symbol: 'BTC',
        slug: 'bitcoin',
        coingeckoId: 'bitcoin',
        logo: '',
      })),
      model((next) => {
        expect(next.editing).toEqual(Option.some({ id: 1 }))
        expect(next.symbol.value).toBe('BTC')
        expect(next.slug.value).toBe('bitcoin')
        expect(next.coingeckoId.value).toBe('bitcoin')
      }),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an empty form sends nothing and marks the required fields', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
      })),
      message(Message.ClickedSaveCoin()),
      model((next) => {
        expect(next.symbol._tag).toBe('Invalid')
        expect(next.name._tag).toBe('Invalid')
        expect(next.slug._tag).toBe('Invalid')
        expect(next.coingeckoId._tag).toBe('Invalid')
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('adding a coin closes the editor, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
      })),
      message(Message.UpdatedCoinSymbol({ value: 'BTC' })),
      message(Message.UpdatedCoinName({ value: 'Bitcoin' })),
      message(Message.UpdatedCoinSlug({ value: 'bitcoin' })),
      message(Message.UpdatedCoinCoingeckoId({ value: 'bitcoin' })),
      message(Message.ClickedSaveCoin()),
      model((next) => {
        expect(next.isSaving).toBe(true)
      }),
      Command.resolve(
        AddCoin({
          name: 'Bitcoin',
          symbol: 'BTC',
          slug: 'bitcoin',
          coingeckoId: 'bitcoin',
          logo: '',
        }),
        Message.SucceededSaveCoin({ symbol: 'BTC' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(next.editor.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused save keeps the editor open with the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
      })),
      message(Message.UpdatedCoinSymbol({ value: 'BTC' })),
      message(Message.UpdatedCoinName({ value: 'Bitcoin' })),
      message(Message.UpdatedCoinSlug({ value: 'bitcoin' })),
      message(Message.UpdatedCoinCoingeckoId({ value: 'bitcoin' })),
      message(Message.ClickedSaveCoin()),
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
      model((next) => {
        expect(next.editor.isOpen).toBe(true)
        expect(next.isSaving).toBe(false)
        expect(next.notice).toEqual(Option.some('slug is already used by another coin'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a refused save on a duplicate CoinGecko id keeps the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
      })),
      message(Message.UpdatedCoinSymbol({ value: 'BTC' })),
      message(Message.UpdatedCoinName({ value: 'Bitcoin' })),
      message(Message.UpdatedCoinSlug({ value: 'bitcoin-2' })),
      message(Message.UpdatedCoinCoingeckoId({ value: 'bitcoin' })),
      message(Message.ClickedSaveCoin()),
      Command.resolve(
        AddCoin({
          name: 'Bitcoin',
          symbol: 'BTC',
          slug: 'bitcoin-2',
          coingeckoId: 'bitcoin',
          logo: '',
        }),
        Message.FailedSaveCoin({ detail: 'CoinGecko id "bitcoin" is already used by another coin.' }),
      ),
      model((next) => {
        expect(next.editor.isOpen).toBe(true)
        expect(next.notice).toEqual(
          Option.some('CoinGecko id "bitcoin" is already used by another coin.'),
        )
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an edit sends the update without the logo', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'coin-editor' })).model,
        editing: () => Option.some({ id: 1 }),
      })),
      message(Message.UpdatedCoinSymbol({ value: 'BTC' })),
      message(Message.UpdatedCoinName({ value: 'Bitcoin' })),
      message(Message.UpdatedCoinSlug({ value: 'bitcoin' })),
      message(Message.UpdatedCoinCoingeckoId({ value: 'bitcoin' })),
      message(Message.ClickedSaveCoin()),
      Command.resolve(
        SaveCoin({
          id: 1,
          name: 'Bitcoin',
          symbol: 'BTC',
          slug: 'bitcoin',
          coingeckoId: 'bitcoin',
        }),
        Message.SucceededSaveCoin({ symbol: 'BTC' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('confirming a removal unlinks the coin, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'coin-remove' })).model,
        maybeRemoving: () => Option.some({ id: 1, symbol: 'BTC' }),
      })),
      message(Message.ClickedConfirmRemoveCoin()),
      Command.resolve(
        DeleteCoin({ id: 1 }),
        Message.SucceededRemoveCoin({ symbol: 'BTC' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(Option.isNone(next.maybeRemoving)).toBe(true)
        expect(next.removeDialog.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'coin-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchCoins({ query: defaultCoinsQuery }),
        Message.SettledFetchCoins({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused removal keeps the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'coin-remove' })).model,
        maybeRemoving: () => Option.some({ id: 1, symbol: 'BTC' }),
      })),
      message(Message.ClickedConfirmRemoveCoin()),
      Command.resolve(
        DeleteCoin({ id: 1 }),
        Message.FailedRemoveCoin({ detail: 'coin no longer exists' }),
      ),
      model((next) => {
        expect(next.notice).toEqual(Option.some('coin no longer exists'))
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })
})
