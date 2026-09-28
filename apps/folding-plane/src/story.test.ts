import { Dialog, Menu } from '@foldkit/ui'
import { Option, Result } from 'effect'
import { AsyncData, FieldValidation } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { Coverage } from './coverage'
import { initialModel } from './model'
import { Message } from './message'
import * as Chains from './page/chains'
import * as Dashboard from './page/dashboard'
import * as Exchanges from './page/exchanges'
import { AppRoute, defaultChainsQuery } from './route'
import { presetFromCookieHeader, themeFromCookieHeader } from './theme'
import { FetchCoverage, PersistPreset, PersistTheme, update } from './update'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

const chainsRoute = AppRoute.Chains({
  search: Option.none(),
  searchBy: Option.none(),
  sort: Option.none(),
  order: Option.none(),
  limit: Option.none(),
  page: Option.none(),
})

describe('route change', () => {
  test('a route change to a page with no seed fetches', () => {
    story(
      update,
      given(initialModel),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/chains') })),
      model((next) => {
        expect(next.route._tag).toBe('Chains')
        expect(AsyncData.isLoading(next.chains.chains)).toBe(true)
      }),
      Command.resolve(
        Chains.FetchChains,
        Chains.Message.SettledFetchChains({ result: Result.fail('unreachable') }),
      ),
      model((next) => {
        expect(AsyncData.isFailure(next.chains.chains)).toBe(true)
      }),
    )
  })

  test('a route change that leaves the query unchanged fetches nothing', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        route: () => chainsRoute,
        chains: (chains) =>
          modifyFields(chains, {
            loadedQuery: () => Option.some(defaultChainsQuery),
            chains: () => AsyncData.Loading(),
          }),
      })),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/chains') })),
      model((next) => {
        expect(next.route._tag).toBe('Chains')
        expect(AsyncData.isLoading(next.chains.chains)).toBe(true)
      }),
      Command.expectNone(),
    )
  })

  test('a route change to the dashboard loads both shortlists', () => {
    story(
      update,
      given(initialModel),
      message(Message.ChangedUrl({ url: urlOrThrow('http://localhost/') })),
      model((next) => {
        expect(next.route._tag).toBe('Dashboard')
        expect(AsyncData.isLoading(next.dashboard.blocked)).toBe(true)
        expect(AsyncData.isLoading(next.dashboard.thin)).toBe(true)
      }),
      Command.resolve(
        Dashboard.FetchBlocked,
        Dashboard.Message.SettledFetchBlocked({ result: Result.fail('unreachable') }),
      ),
      Command.resolve(
        Dashboard.FetchThin,
        Dashboard.Message.SettledFetchThin({ result: Result.fail('unreachable') }),
      ),
      model((next) => {
        expect(AsyncData.isFailure(next.dashboard.blocked)).toBe(true)
        expect(AsyncData.isFailure(next.dashboard.thin)).toBe(true)
      }),
    )
  })
})

describe('catalogue write', () => {
  test('adding a chain re-reads the rail', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        chains: (chains) =>
          modifyFields(chains, {
            editor: () => Dialog.open(Dialog.init({ id: 'chain-editor' })).model,
            name: () => FieldValidation.Valid({ value: 'Ethereum' }),
            code: () => FieldValidation.Valid({ value: 'ETH' }),
          }),
      })),
      message(Message.GotChainsMessage({ message: Chains.Message.ClickedSaveChain() })),
      Command.resolve(
        Chains.AddChain({ name: 'Ethereum', code: 'ETH' }),
        Chains.Message.SucceededSaveChain({ code: 'ETH' }),
      ),
      model((next) => {
        expect(AsyncData.isLoading(next.coverage)).toBe(true)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'chain-editor' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        Chains.FetchChains,
        Chains.Message.SettledFetchChains({ result: Result.fail('unreachable') }),
      ),
      Command.resolve(
        FetchCoverage,
        Message.SettledFetchCoverage({
          result: Result.succeed(Coverage.make({
            coins: 1,
            exchanges: 1,
            chains: 1,
            markets: 1,
            runningWorkers: 1,
            totalWorkers: 1,
            reconnectingShards: 0,
          })),
        }),
      ),
      model((next) => {
        expect(AsyncData.isSuccess(next.coverage)).toBe(true)
      }),
    )
  })

  test('removing an exchange re-reads the rail', () => {
    story(
      update,
      given(modifyFields(initialModel, {
        exchanges: (exchanges) =>
          modifyFields(exchanges, {
            removeDialog: () => Dialog.open(Dialog.init({ id: 'exchange-remove' })).model,
            maybeRemoving: () => Option.some({ id: 10, name: 'Binance' }),
          }),
      })),
      message(Message.GotExchangesMessage({ message: Exchanges.Message.ClickedConfirmRemoveExchange() })),
      Command.resolve(
        Exchanges.DeleteExchange({ id: 10 }),
        Exchanges.Message.SucceededRemoveExchange({ name: 'Binance' }),
      ),
      model((next) => {
        expect(AsyncData.isLoading(next.coverage)).toBe(true)
      }),
      Command.resolve(
        Dialog.CloseDialog({ id: 'exchange-remove' }),
        Dialog.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        Exchanges.FetchExchanges,
        Exchanges.Message.SettledFetchExchanges({ result: Result.fail('unreachable') }),
      ),
      Command.resolve(
        FetchCoverage,
        Message.SettledFetchCoverage({
          result: Result.succeed(Coverage.make({
            coins: 1,
            exchanges: 1,
            chains: 1,
            markets: 1,
            runningWorkers: 1,
            totalWorkers: 1,
            reconnectingShards: 0,
          })),
        }),
      ),
      model((next) => {
        expect(AsyncData.isSuccess(next.coverage)).toBe(true)
      }),
    )
  })
})

describe('theme', () => {
  test('selecting Dark switches the theme and persists it', () => {
    story(
      update,
      given(initialModel),
      message(
        Message.GotThemeMenuMessage({
          message: Menu.Message.SelectedItem({ index: 1, item: 'Dark' }),
        }),
      ),
      model((next) => {
        expect(next.theme).toBe('Dark')
      }),
      Command.resolve(
        PersistTheme({ theme: 'Dark' }),
        Message.CompletedPersistTheme(),
      ),
      Command.expectNone(),
    )
  })

  test('the server renders the theme from the cookie, defaulting to Light', () => {
    expect(themeFromCookieHeader('')).toBe('Light')
    expect(themeFromCookieHeader('lister-theme=Dark')).toBe('Dark')
    expect(themeFromCookieHeader('lister-theme=Light')).toBe('Light')
    expect(themeFromCookieHeader('lister-theme=Sepia')).toBe('Light')
  })

  test('selecting a preset switches the palette and persists it', () => {
    story(
      update,
      given(initialModel),
      message(
        Message.GotPresetMenuMessage({
          message: Menu.Message.SelectedItem({ index: 2, item: 'Slate' }),
        }),
      ),
      model((next) => {
        expect(next.preset).toBe('Slate')
      }),
      Command.resolve(
        PersistPreset({ preset: 'Slate' }),
        Message.CompletedPersistPreset(),
      ),
      Command.expectNone(),
    )
  })

  test('the server renders the preset from the cookie, defaulting to Default', () => {
    expect(presetFromCookieHeader('')).toBe('Default')
    expect(presetFromCookieHeader('lister-preset=Zinc')).toBe('Zinc')
    expect(presetFromCookieHeader('lister-preset=Default')).toBe('Default')
    expect(presetFromCookieHeader('lister-preset=Unknown')).toBe('Default')
  })
})
