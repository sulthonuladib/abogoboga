import { Dialog } from '@foldkit/ui'
import { Option, Result, Schema } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'
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
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { ExchangePageResponse } from '../../api'
import { defaultExchangesQuery, exchangeDetailUrl, exchangesUrl } from '../../route'
import { Message } from './message'
import { Model, initialModel } from './model'
import { AddExchange, DeleteExchange, FetchExchanges, update } from './update'
import { view } from './view'

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
    {
      id: 11,
      coingeckoId: 'indodax',
      name: 'Indodax',
      slug: 'indodax',
      logo: '',
      registeredOnCmc: false,
      baseCurrency: 'idr',
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

const emptyPage = Schema.decodeUnknownSync(ExchangePageResponse)({
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
  query: () => defaultExchangesQuery,
  exchanges: () => AsyncData.succeed(fixturePage),
})

const resolveDialogOpen = [
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe('exchanges listing', () => {
  test('page numbers are links that mark the current page', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('link', { name: 'Page 2' })).toHaveAttr(
        'href',
        exchangesUrl({ ...defaultExchangesQuery, page: 2 }),
      ),
      expect(role('link', { name: 'Page 1' })).toHaveAttr('aria-current', 'page'),
      expect(role('button', { name: 'Page 2' })).toBeAbsent(),
    )
  })

  test('per-row controls keep their accessible names without tooltips', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Edit Binance' })).toHaveAccessibleName('Edit Binance'),
      expect(role('button', { name: 'Remove Binance' })).toHaveAccessibleName('Remove Binance'),
      expect(role('tooltip')).toBeAbsent(),
    )
  })

  test('the table names its columns and links each name', () => {
    scene(
      { update, view },
      given(loadedModel),
      expect(role('button', { name: 'Sort by Name, currently ascending' })).toExist(),
      expect(role('button', { name: 'Sort by Slug, currently not sorted' })).toExist(),
      expect(role('button', { name: 'Sort by Created, currently not sorted' })).toExist(),
      expect(role('link', { name: 'Binance' })).toHaveAttr('href', exchangeDetailUrl(10)),
      expect(role('link', { name: 'Indodax' })).toHaveAttr('href', exchangeDetailUrl(11)),
      expect(text('binance')).toExist(),
      expect(text('USDT')).toExist(),
      expect(text('yes')).toExist(),
      expect(text('no')).toExist(),
    )
  })

  test('an empty catalogue invites the first exchange', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultExchangesQuery,
        exchanges: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No exchanges yet. Add the first exchange so coins can be assigned to a venue.')).toExist(),
    )
  })

  test('a search with no rows suggests a shorter one', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => ({ ...defaultExchangesQuery, search: 'zzz' }),
        exchanges: () => AsyncData.succeed(emptyPage),
      })),
      expect(text('No exchanges match. Try a shorter search, or add the exchange you are looking for.')).toExist(),
    )
  })

  test('a failed read shows the reason with a retry', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultExchangesQuery,
        exchanges: () => AsyncData.fail('could not reach the API. Check that the control plane is running.'),
      })),
      expect(role('alert')).toExist(),
      expect(text('Could not load exchanges')).toExist(),
      expect(text('could not reach the API. Check that the control plane is running.')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('retrying a failed read fills the table', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        query: () => defaultExchangesQuery,
        exchanges: () => AsyncData.fail('unreachable'),
      })),
      click(role('button', { name: 'Retry' })),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      expect(text('Binance')).toExist(),
      expect(text('Could not load exchanges')).toBeAbsent(),
    )
  })

  test('the editor validates before it sends', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New exchange' })),
      ...resolveDialogOpen,
      expect(text('New exchange')).toExist(),
      expect(role('button', { name: 'Add exchange' })).toBeDisabled(),
      type(role('textbox', { name: 'Name' }), 'Binance'),
      type(role('textbox', { name: 'Slug' }), 'binance'),
      type(role('textbox', { name: 'CoinGecko id' }), 'binance'),
      expect(role('button', { name: 'Add exchange' })).toBeEnabled(),
    )
  })

  test('the editor shows what a refused save reports', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'New exchange' })),
      ...resolveDialogOpen,
      type(role('textbox', { name: 'Name' }), 'Binance'),
      type(role('textbox', { name: 'Slug' }), 'binance'),
      type(role('textbox', { name: 'CoinGecko id' }), 'binance'),
      click(role('button', { name: 'Add exchange' })),
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
      expect(text('New exchange')).toExist(),
      expect(text('slug is already used')).toExist(),
    )
  })

  test('removal states what it unlinks', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove Binance' })),
      ...resolveDialogOpen,
      expect(text('Remove Binance?')).toExist(),
      expect(text('Binance is removed with every market assigned to it. Re-adding the exchange does not restore those assignments.')).toExist(),
      expect(role('button', { name: 'Remove exchange' })).toBeEnabled(),
    )
  })

  test('confirming a removal closes the dialog and re-reads', () => {
    scene(
      { update, view },
      given(loadedModel),
      click(role('button', { name: 'Remove Binance' })),
      ...resolveDialogOpen,
      click(role('button', { name: 'Remove exchange' })),
      Command.resolve(
        DeleteExchange({ id: 10 }),
        Message.SucceededRemoveExchange({ name: 'Binance' }),
      ),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FetchExchanges({ query: defaultExchangesQuery }),
        Message.SettledFetchExchanges({ result: Result.succeed(fixturePage) }),
      ),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(text('Remove Binance?')).toBeAbsent(),
      expect(text('Binance')).toExist(),
    )
  })

  test('editing names the exchange on screen', () => {
    scene(
      { update, view },
      given(modifyFields(loadedModel, {
        editor: () => Dialog.open(Dialog.init({ id: 'exchange-editor' })).model,
        editing: () => Option.some({ id: 10 }),
        name: () => FieldValidation.Valid({ value: 'Binance' }),
        slug: () => FieldValidation.Valid({ value: 'binance' }),
        coingeckoId: () => FieldValidation.Valid({ value: 'binance' }),
        logo: () => FieldValidation.NotValidated({ value: '' }),
      })),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      expect(text('Edit Binance')).toExist(),
      expect(role('textbox', { name: 'Name' })).toHaveValue('Binance'),
      expect(role('textbox', { name: 'Slug' })).toHaveValue('binance'),
      expect(role('textbox', { name: 'CoinGecko id' })).toHaveValue('binance'),
    )
  })
})
