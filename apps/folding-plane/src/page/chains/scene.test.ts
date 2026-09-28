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

import { ChainPageResponse } from '../../api'
import { chainDetailUrl, chainsUrl, defaultChainsQuery } from '../../route'
import { Message } from './message'
import { Model, initialModel } from './model'
import { AddChain, DeleteChain, FetchChains, NavigateChains, update } from './update'
import { view } from './view'

const fixturePage = Schema.decodeUnknownSync(ChainPageResponse)({
  data: [
    {
      id: 1,
      name: 'Ethereum',
      code: 'ETH',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
    },
    {
      id: 2,
      name: 'Bitcoin',
      code: 'BTC',
      createdAt: '2024-01-03T03:04:05.000Z',
      updatedAt: '2024-01-03T03:04:05.000Z',
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
    searchBy: 'name',
    order: 'asc',
    orderBy: 'name',
  },
})

const emptyPage = Schema.decodeUnknownSync(ChainPageResponse)({
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
    searchBy: 'name',
    order: 'asc',
    orderBy: 'name',
  },
})

const loadedModel: Model = modifyFields(initialModel, {
  query: () => defaultChainsQuery,
  loadedQuery: () => Option.some(defaultChainsQuery),
  chains: () => AsyncData.succeed(fixturePage),
})

const resolveDialogOpen = [
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe('chains listing', () => {
  test('page numbers are links that mark the current page', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('link', { name: 'Page 2' })).toHaveAttr(
        'href',
        chainsUrl({ ...defaultChainsQuery, page: 2 }),
      ),
      expect(role('link', { name: 'Page 1' })).toHaveAttr('aria-current', 'page'),
      expect(role('button', { name: 'Page 2' })).toBeAbsent(),
    )
  })

  test('per-row controls keep their accessible names without tooltips', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Edit ETH' })).toHaveAccessibleName('Edit ETH'),
      expect(role('button', { name: 'Remove ETH' })).toHaveAccessibleName('Remove ETH'),
      expect(role('tooltip')).toBeAbsent(),
    )
  })

  test('the table names its columns and links each code', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Sort by Code, currently not sorted' })).toExist(),
      expect(role('button', { name: 'Sort by Name, currently ascending' })).toExist(),
      expect(role('button', { name: 'Sort by Created, currently not sorted' })).toExist(),
      expect(role('link', { name: 'ETH' })).toHaveAttr('href', chainDetailUrl(1)),
      expect(role('link', { name: 'BTC' })).toHaveAttr('href', chainDetailUrl(2)),
      expect(text('Ethereum')).toExist(),
      expect(text('Bitcoin')).toExist(),
    )
  })

  test('an empty catalogue invites the first chain', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultChainsQuery,
        chains: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No chains yet. Add the first chain to start linking markets.')).toExist(),
    )
  })

  test('a search with no rows suggests a shorter one', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => ({ ...defaultChainsQuery, search: 'zzz' }),
        chains: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No chains match. Try a shorter search, or add the chain you are looking for.')).toExist(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultChainsQuery,
        chains: () => AsyncData.fail('could not reach the API. Check that the control plane is running.'),
      })),
      expect(role('alert')).toExist(),
      expect(text('Could not load chains')).toExist(),
      expect(text('could not reach the API. Check that the control plane is running.')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('retrying a failed read fills the table', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultChainsQuery,
        chains: () => AsyncData.fail('unreachable'),
      })),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      expect(text('Ethereum')).toExist(),
      expect(text('Could not load chains')).toBeAbsent(),
    )
  })

  test('the editor validates before it sends', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New chain' })),
      ...resolveDialogOpen,
      expect(text('New chain')).toExist(),
      expect(role('button', { name: 'Add chain' })).toBeDisabled(),
      type(role('textbox', { name: 'Code' }), 'ETH'),
      type(role('textbox', { name: 'Name' }), 'Ethereum'),
      expect(role('button', { name: 'Add chain' })).toBeEnabled(),
    )
  })

  test('the editor shows what a refused save reports', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New chain' })),
      ...resolveDialogOpen,
      type(role('textbox', { name: 'Code' }), 'ETH'),
      type(role('textbox', { name: 'Name' }), 'Ethereum'),
      click(role('button', { name: 'Add chain' })),
      Command.resolve(
        AddChain({ name: 'Ethereum', code: 'ETH' }),
        Message.FailedSaveChain({ detail: 'code is already used' }),
      ),
      expect(text('New chain')).toExist(),
      expect(text('code is already used')).toExist(),
    )
  })

  test('removal states what it unlinks', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove ETH' })),
      ...resolveDialogOpen,
      expect(text('Remove ETH?')).toExist(),
      expect(role('dialog', { name: 'Remove ETH?' })).toHaveAttr('data-size', 'sm'),
      expect(text('ETH is unlinked from every market that routes through it. Re-adding the chain does not restore those links.')).toExist(),
      expect(role('button', { name: 'Remove chain' })).toBeEnabled(),
    )
  })

  test('confirming a removal closes the dialog and re-reads', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove ETH' })),
      ...resolveDialogOpen,
      click(role('button', { name: 'Remove chain' })),
      Command.resolve(
        DeleteChain({ id: 1 }),
        Message.SucceededRemoveChain({ code: 'ETH' }),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'chain-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchChains({ query: defaultChainsQuery }),
        Message.SettledFetchChains({ result: Result.succeed(fixturePage) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Remove ETH?')).toBeAbsent(),
      expect(text('Ethereum')).toExist(),
    )
  })

  test('editing names the chain on screen', () => {
    scene(
      { update, view },
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
        editing: () => Option.some({ id: 1 }),
        name: () => FieldValidation.Valid({ value: 'Ethereum' }),
        code: () => FieldValidation.Valid({ value: 'ETH' }),
      })),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      expect(text('Edit ETH')).toExist(),
      expect(role('textbox', { name: 'Code' })).toHaveValue('ETH'),
      expect(role('textbox', { name: 'Name' })).toHaveValue('Ethereum'),
    )
  })

  test('a searched field is a navigation', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('checkbox', { name: 'Code' })),
      Command.resolve(
        NavigateChains({
          url: chainsUrl({ ...defaultChainsQuery, searchBy: ['name'], page: 1 }),
        }),
        Message.CompletedNavigateChains(),
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
        NavigateChains({
          url: chainsUrl({ ...defaultChainsQuery, limit: 50, page: 1 }),
        }),
        Message.CompletedNavigateChains(),
      ),
    )
  })
})
