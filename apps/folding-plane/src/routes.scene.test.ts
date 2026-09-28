import { Option } from 'effect'
import { expect, given, role, scene, text } from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { initialModel } from './model'
import { AppRoute, dashboardRouter } from './route'
import { update } from './update'
import { view } from './view'

const coinsRoute = AppRoute.Coins({
  search: Option.none(),
  flag: Option.none(),
  sort: Option.none(),
  order: Option.none(),
  page: Option.none(),
})

const coinRoutesRoute = AppRoute.CoinRoutes({ coinId: 1 })

const exchangesRoute = AppRoute.Exchanges({
  search: Option.none(),
  sort: Option.none(),
  order: Option.none(),
  page: Option.none(),
})

const chainsRoute = AppRoute.Chains({
  search: Option.none(),
  sort: Option.none(),
  order: Option.none(),
  page: Option.none(),
})

describe('routes', () => {
  test('the dashboard resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => AppRoute.Dashboard() })),
      expect(text('Dashboard')).toExist(),
    )
  })

  test('the coin listing resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => coinsRoute })),
      expect(text('Coins')).toExist(),
    )
  })

  test('a coin routes resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => coinRoutesRoute })),
      expect(text('Coin routes')).toExist(),
    )
  })

  test('the exchange listing resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => exchangesRoute })),
      expect(text('Exchanges')).toExist(),
    )
  })

  test('an exchange resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        route: () => AppRoute.ExchangeDetail({ exchangeId: 10 }),
      })),
      expect(text('Exchange')).toExist(),
    )
  })

  test('the chain listing resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => chainsRoute })),
      expect(text('Chains')).toExist(),
    )
  })

  test('a chain resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        route: () => AppRoute.ChainDetail({ chainId: 5 }),
      })),
      expect(text('Chain')).toExist(),
    )
  })

  test('the worker monitor resolves', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { route: () => AppRoute.Workers() })),
      expect(text('Workers')).toExist(),
    )
  })

  test('an unknown path renders the not-found page with a way back', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, {
        route: () => AppRoute.NotFound({ path: '/nope' }),
      })),
      expect(text('Nothing here')).toExist(),
      expect(text('No page answers to /nope.')).toExist(),
      expect(role('link', { name: 'Back to the dashboard' })).toHaveAttr(
        'href',
        dashboardRouter(),
      ),
    )
  })
})
