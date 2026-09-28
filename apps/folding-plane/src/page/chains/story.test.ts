import { Dialog } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { Interruptible } from 'foldkit/command'
import { AsyncData } from 'foldkit'
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { ChainPageResponse } from '../../api'
import { chainsUrl, defaultChainsQuery } from '../../route'
import { Message, OutMessage } from './message'
import { initialModel } from './model'
import {
  AddChain,
  DeleteChain,
  FetchChains,
  NavigateChains,
  SaveChain,
  SearchChains,
  informRouteChanged,
  init,
  update,
} from './update'

const fixturePage = Schema.decodeUnknownSync(ChainPageResponse)({
  data: [
    {
      id: 1,
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

const loadedModel = modifyFields(initialModel, {
  query: () => defaultChainsQuery,
  loadedQuery: () => Option.some(defaultChainsQuery),
  chains: () => AsyncData.succeed(fixturePage),
})

describe('init', () => {
  test('without a seed the first window loads', () => {
    const started = init(defaultChainsQuery, Option.none())

    expect(AsyncData.isLoading(started.model.chains)).toBe(true)
    expect(started.commands?.map((command) => command.name)).toEqual([FetchChains.name])
  })

  test('with a seed nothing fetches', () => {
    const started = init(defaultChainsQuery, Option.some(AsyncData.succeed(fixturePage)))

    expect(AsyncData.isSuccess(started.model.chains)).toBe(true)
    expect(started.commands).toBeUndefined()
  })
})

describe('informRouteChanged', () => {
  test('the same query on a loaded page fetches nothing', () => {
    expect(informRouteChanged(loadedModel, defaultChainsQuery).commands).toBeUndefined()
  })

  test('the same query on a page that never loaded fetches', () => {
    const next = informRouteChanged(initialModel, defaultChainsQuery)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchChains.name])
  })

  test('a changed query loads its window', () => {
    const next = informRouteChanged(loadedModel, { ...defaultChainsQuery, page: 2 })

    expect(AsyncData.isLoading(next.model.chains)).toBe(true)
    expect(next.commands?.map((command) => command.name)).toEqual([FetchChains.name])
  })
})

describe('update', () => {
  test('typing a search holds the text and waits for the pause', () => {
    story(
      update,
      given(loadedModel),
      message(Message.UpdatedSearch({ value: 'eth' })),
      model((next) => {
        expect(next.query.search).toBe('eth')
      }),
      Command.resolve(SearchChains({ query: { ...defaultChainsQuery, search: 'eth' } }), Message.CompletedSearchChains()),
      Command.resolve(
        SearchChains.Interrupt((outcome) =>
          Message.CompletedInterruptSearchChains({ outcome })
        ),
        Message.CompletedInterruptSearchChains({ outcome: Interruptible.Outcome.NotFound() }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a search keeps the current sort and resets the page', () => {
    const filtered = {
      ...defaultChainsQuery,
      sort: 'createdAt' as const,
      order: 'desc' as const,
      page: 3,
    }
    const target = {
      ...defaultChainsQuery,
      sort: 'createdAt' as const,
      order: 'desc' as const,
      search: 'eth',
      page: 1,
    }

    story(
      update,
      given(modifyFields(loadedModel, { query: () => filtered })),
      message(Message.UpdatedSearch({ value: 'eth' })),
      model((next) => {
        expect(next.query).toEqual(target)
      }),
      Command.resolve(SearchChains({ query: target }), Message.CompletedSearchChains()),
      Command.resolve(
        SearchChains.Interrupt((outcome) =>
          Message.CompletedInterruptSearchChains({ outcome })
        ),
        Message.CompletedInterruptSearchChains({ outcome: Interruptible.Outcome.NotFound() }),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a landed search issues exactly one read though the draft already holds the text', () => {
    const typed = update(loadedModel, Message.UpdatedSearch({ value: 'eth' })).model
    const landed = informRouteChanged(typed, { ...defaultChainsQuery, search: 'eth' })

    expect(landed.commands?.map((command) => command.name)).toEqual([FetchChains.name])
    expect(AsyncData.isLoading(landed.model.chains)).toBe(true)
  })

  test('a searched-field or size change is fetched with the new query', () => {
    const query = {
      ...defaultChainsQuery,
      searchBy: ['code'] as const,
      limit: 10,
      page: 2,
    }
    const next = informRouteChanged(loadedModel, query)

    expect(next.commands?.map((command) => command.name)).toEqual([FetchChains.name])
    expect(next.model.query).toEqual(query)
    expect(AsyncData.isLoading(next.model.chains)).toBe(true)
  })

  test('sorting a new column navigates ascending from the first page', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedSort({ column: 'code' })),
      Command.resolve(
        NavigateChains({
          url: chainsUrl({ ...defaultChainsQuery, sort: 'code', order: 'asc', page: 1 }),
        }),
        Message.CompletedNavigateChains(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('sorting the same column twice flips the direction', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        query: () => ({ ...defaultChainsQuery, sort: 'code', order: 'asc' }),
      })),
      message(Message.ClickedSort({ column: 'code' })),
      Command.resolve(
        NavigateChains({
          url: chainsUrl({ ...defaultChainsQuery, sort: 'code', order: 'desc', page: 1 }),
        }),
        Message.CompletedNavigateChains(),
      ),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('a settled fetch fills the table', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        query: () => defaultChainsQuery,
        chains: () => AsyncData.Loading(),
      })),
      message(Message.SettledFetchChains({ result: Result.succeed(fixturePage) })),
      model((next) => {
        expect(AsyncData.isSuccess(next.chains)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('a failed fetch keeps its reason', () => {
    story(
      update,
      given(modifyFields(initialModel, { chains: () => AsyncData.Loading() })),
      message(Message.SettledFetchChains({ result: Result.fail('unreachable') })),
      model((next) => {
        expect(AsyncData.isFailure(next.chains)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('retrying a stale listing re-reads its window', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        chains: () => AsyncData.Stale({ error: 'stale', data: fixturePage }),
      })),
      message(Message.ClickedRetry()),
      model((next) => {
        expect(AsyncData.isRefreshing(next.chains)).toBe(true)
      }),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      model((next) => {
        expect(AsyncData.isSuccess(next.chains)).toBe(true)
      }),
      expectNoOutMessage(),
    )
  })

  test('opening the editor starts blank for a new chain', () => {
    story(
      update,
      given(loadedModel),
      message(Message.ClickedNewChain()),
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
      message(Message.ClickedEditChain({ id: 1, name: 'Ethereum', code: 'ETH' })),
      model((next) => {
        expect(next.editing).toEqual(Option.some({ id: 1 }))
        expect(next.name.value).toBe('Ethereum')
        expect(next.code.value).toBe('ETH')
      }),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an empty form sends nothing and marks both fields', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
      })),
      message(Message.ClickedSaveChain()),
      model((next) => {
        expect(next.name._tag).toBe('Invalid')
        expect(next.code._tag).toBe('Invalid')
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('adding a chain closes the editor, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
      })),
      message(Message.UpdatedChainName({ value: 'Ethereum' })),
      message(Message.UpdatedChainCode({ value: 'ETH' })),
      message(Message.ClickedSaveChain()),
      model((next) => {
        expect(next.isSaving).toBe(true)
      }),
      Command.resolve(
        AddChain({ name: 'Ethereum', code: 'ETH' }),
        Message.SucceededSaveChain({ code: 'ETH' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(next.editor.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'chain-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused save keeps the editor open with the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
      })),
      message(Message.UpdatedChainName({ value: 'Ethereum' })),
      message(Message.UpdatedChainCode({ value: 'ETH' })),
      message(Message.ClickedSaveChain()),
      Command.resolve(
        AddChain({ name: 'Ethereum', code: 'ETH' }),
        Message.FailedSaveChain({ detail: 'code is already used' }),
      ),
      model((next) => {
        expect(next.editor.isOpen).toBe(true)
        expect(next.isSaving).toBe(false)
        expect(next.notice).toEqual(Option.some('code is already used'))
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })

  test('saving an edit sends the update', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
        editing: () => Option.some({ id: 1 }),
      })),
      message(Message.UpdatedChainName({ value: 'Ethereum Mainnet' })),
      message(Message.UpdatedChainCode({ value: 'ETH' })),
      message(Message.ClickedSaveChain()),
      Command.resolve(
        SaveChain({ id: 1, name: 'Ethereum Mainnet', code: 'ETH' }),
        Message.SucceededSaveChain({ code: 'ETH' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      Command.resolve(
        Dialog.CloseDialog({ id: 'chain-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('confirming a removal unlinks the chain, re-reads, and re-reads the rail', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'chain-remove' })).model,
        maybeRemoving: () => Option.some({ id: 1, code: 'ETH' }),
      })),
      message(Message.ClickedConfirmRemoveChain()),
      Command.resolve(
        DeleteChain({ id: 1 }),
        Message.SucceededRemoveChain({ code: 'ETH' }),
      ),
      expectOutMessage(OutMessage.ChangedCatalogue()),
      model((next) => {
        expect(Option.isNone(next.maybeRemoving)).toBe(true)
        expect(next.removeDialog.isOpen).toBe(false)
        expect(next.isSaving).toBe(false)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'chain-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      Command.expectNone(),
    )
  })

  test('a refused removal keeps the reason', () => {
    story(
      update,
      given(modifyFields(loadedModel, {
        removeDialog: () => Dialog.open(Dialog.init({ id: 'chain-remove' })).model,
        maybeRemoving: () => Option.some({ id: 1, code: 'ETH' }),
      })),
      message(Message.ClickedConfirmRemoveChain()),
      Command.resolve(
        DeleteChain({ id: 1 }),
        Message.FailedRemoveChain({ detail: 'chain still has links' }),
      ),
      model((next) => {
        expect(next.notice).toEqual(Option.some('chain still has links'))
        expect(next.isSaving).toBe(false)
      }),
      Command.expectNone(),
      expectNoOutMessage(),
    )
  })
})
