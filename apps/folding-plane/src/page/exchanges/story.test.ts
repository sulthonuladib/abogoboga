import { Dialog } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { Interruptible } from 'foldkit/command'
import { AsyncData } from 'foldkit'
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { ExchangePageResponse } from '../../api'
import { defaultExchangesQuery, exchangesUrl } from '../../route'
import { Message, OutMessage } from './message'
import { initialModel } from './model'
import {
  AddExchange,
  DeleteExchange,
  FetchExchanges,
  NavigateExchanges,
  SaveExchange,
  SearchExchanges,
  informRouteChanged,
  init,
  update,
} from './update'

const fixturePage = Schema.decodeUnknownSync(ExchangePageResponse)({
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

const loadedModel = modifyFields(initialModel, {
  query: () => defaultExchangesQuery,
  exchanges: () => AsyncData.succeed(fixturePage),
})

describe('init', () => {
  test('without a seed the first window loads', () => {
    const started = init(defaultExchangesQuery, Option.none())

    expect(AsyncData.isLoading(started.model.exchanges)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([FetchExchanges.name])
  })

  test('with a seed nothing fetches', () => {
    const started = init(defaultExchangesQuery, Option.some(AsyncData.succeed(fixturePage)))

    expect(AsyncData.isSuccess(started.model.exchanges)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('informRouteChanged', () => {
  test('the same query on a loaded page fetches nothing', () => {
    expect(informRouteChanged(loadedModel, defaultExchangesQuery).commands).toBeUndefined()
  })

  test('the same query on a page that never loaded fetches', () => {
    const next = informRouteChanged(initialModel, defaultExchangesQuery)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchExchanges.name])
  })

  test('a changed query loads its window', () => {
    const next = informRouteChanged(loadedModel, { ...defaultExchangesQuery, page: 2 })

    expect(AsyncData.isLoading(next.model.exchanges)).toBe(true)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchExchanges.name])
  })
})

describe('update', () => {
  test('typing a search holds the text and waits for the pause', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedSearch({ value: 'bin' })),
      model((next) => {
        expect(next.query.search).toBe('bin')
      }),
      Command.resolve(SearchExchanges({ search: 'bin' }), Message.CompletedSearchExchanges()),
      Command.resolve(
        SearchExchanges.Interrupt((outcome) =>
          Message.CompletedInterruptSearchExchanges({ outcome })
        ),
        Message.CompletedInterruptSearchExchanges({ outcome: Interruptible.Outcome.NotFound() }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('sorting a new column navigates ascending from the first page', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedSort({ column: 'slug' })),
      Command.resolve(
        NavigateExchanges({
          url: exchangesUrl({ ...defaultExchangesQuery, sort: 'slug', order: 'asc', page: 1 }),
        }),
        Message.CompletedNavigateExchanges(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('sorting the same column twice flips the direction', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        query: () => ({ ...defaultExchangesQuery, sort: 'slug', order: 'asc' }),
      })),
      message(Message.ClickedSort({ column: 'slug' })),
      Command.resolve(
        NavigateExchanges({
          url: exchangesUrl({ ...defaultExchangesQuery, sort: 'slug', order: 'desc', page: 1 }),
        }),
        Message.CompletedNavigateExchanges(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a settled fetch fills the table', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        query: () => defaultExchangesQuery,
        exchanges: () => AsyncData.Loading(),
      })),
      message(Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.exchanges)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('a failed fetch keeps its reason', () => {
    story(
      update,
      given(modifyFields(initialModel, { exchanges: () => AsyncData.Loading() })),
      message(Message.SettledFetchExchanges({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.exchanges)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('retrying a stale listing re-reads its window', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        exchanges: () => AsyncData.Stale({ error: 'stale', data: fixturePage }),
      })),
      message(Message.ClickedRetry()),
      model((next) => {
        expect(AsyncData.isRefreshing(next.exchanges)).toBe(true)
      }),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      model((next) => {
        expect(AsyncData.isSuccess(next.exchanges)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('opening the editor starts blank for a new exchange', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedNewExchange()),
      model((next) => {
        expect(Option.isNone(next.editing)).toBe(true)
        expect(next.editor.isOpen).toBe(true)
        expect(next.baseCurrency).toBe('usdt')
        expect(next.registeredOnCmc).toBe(true)
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
      message(Message.ClickedEditExchange({
        id: 10,
        name: 'Binance',
        slug: 'binance',
        coingeckoId: 'binance',
        logo: '',
        baseCurrency: 'usdt',
        registeredOnCmc: true,
      })),
      model((next) => {
        expect(next.editing).toEqual(Option.some({ id: 10 }))
        expect(next.name.value).toBe('Binance')
        expect(next.slug.value).toBe('binance')
        expect(next.coingeckoId.value).toBe('binance')
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
        editor: () => Dialog.open(Dialog.init({ id: 'exchange-editor' })).model,
      })),
      message(Message.ClickedSaveExchange()),
      model((next) => {
        expect(next.name._tag).toBe('Invalid')
        expect(next.slug._tag).toBe('Invalid')
        expect(next.coingeckoId._tag).toBe('Invalid')
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('adding an exchange closes the editor, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'exchange-editor' })).model,
      })),
      message(Message.UpdatedExchangeName({ value: 'Binance' })),
      message(Message.UpdatedExchangeSlug({ value: 'binance' })),
      message(Message.UpdatedExchangeCoingeckoId({ value: 'binance' })),
      message(Message.ClickedSaveExchange()),
      model((next) => {
        expect(next.isSaving).toBe(true)
      }),
      Command.resolve(
        AddExchange({
          name: 'Binance',
          slug: 'binance',
          coingeckoId: 'binance',
          logo: '',
          baseCurrency: 'usdt',
          registeredOnCmc: true,
        }),
        Message.SucceededSaveExchange({ name: 'Binance' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(next.editor.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused save keeps the editor open with the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'exchange-editor' })).model,
      })),
      message(Message.UpdatedExchangeName({ value: 'Binance' })),
      message(Message.UpdatedExchangeSlug({ value: 'binance' })),
      message(Message.UpdatedExchangeCoingeckoId({ value: 'binance' })),
      message(Message.ClickedSaveExchange()),
      Command.resolve(
        AddExchange({
          name: 'Binance',
          slug: 'binance',
          coingeckoId: 'binance',
          logo: '',
          baseCurrency: 'usdt',
          registeredOnCmc: true,
        }),
        Message.FailedSaveExchange({ detail: 'slug is already used' }),
      ),
      model((next) => {
        expect(next.editor.isOpen).toBe(true)
        expect(next.isSaving).toBe(false)
        expect(next.notice).toEqual(Option.some('slug is already used'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an edit sends the update', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'exchange-editor' })).model,
        editing: () => Option.some({ id: 10 }),
      })),
      message(Message.UpdatedExchangeName({ value: 'Binance US' })),
      message(Message.UpdatedExchangeSlug({ value: 'binance' })),
      message(Message.UpdatedExchangeCoingeckoId({ value: 'binance' })),
      message(Message.ClickedSaveExchange()),
      Command.resolve(
        SaveExchange({
          id: 10,
          name: 'Binance US',
          slug: 'binance',
          coingeckoId: 'binance',
          logo: '',
          baseCurrency: 'usdt',
          registeredOnCmc: true,
        }),
        Message.SucceededSaveExchange({ name: 'Binance US' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('confirming a removal unlinks the exchange, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'exchange-remove' })).model,
        maybeRemoving: () => Option.some({ id: 10, name: 'Binance' }),
      })),
      message(Message.ClickedConfirmRemoveExchange()),
      Command.resolve(
        DeleteExchange({ id: 10 }),
        Message.SucceededRemoveExchange({ name: 'Binance' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(Option.isNone(next.maybeRemoving)).toBe(true)
        expect(next.removeDialog.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused removal keeps the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'exchange-remove' })).model,
        maybeRemoving: () => Option.some({ id: 10, name: 'Binance' }),
      })),
      message(Message.ClickedConfirmRemoveExchange()),
      Command.resolve(
        DeleteExchange({ id: 10 }),
        Message.FailedRemoveExchange({ detail: 'exchange still has markets' }),
      ),
      model((next) => {
        expect(next.notice).toEqual(Option.some('exchange still has markets'))
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })
})
