import { Menu, Tooltip } from '@foldkit/ui'
import { AsyncData } from 'foldkit'
import {
  Mount,
  expect,
  given,
  inside,
  role,
  scene,
  selector,
  text,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { initialModel } from './model'
import { Coverage } from './coverage'
import { chainsUrl, dashboardRouter, defaultChainsQuery } from './route'
import { ThemeMenu } from './themeMenu'
import { update } from './update'
import { view } from './view'

const coverageFigures = Coverage.make({
  coins: 41,
  exchanges: 7,
  chains: 9,
  markets: 13,
  runningWorkers: 2,
  totalWorkers: 3,
  reconnectingShards: 1,
})

const failedCoverageModel = modifyFields(initialModel, {
  coverage: () =>
    AsyncData.fail(
      'could not reach the API. Check that the control plane is running.',
    ),
})

const refreshingCoverageModel = modifyFields(initialModel, {
  coverage: () => AsyncData.Refreshing({ data: coverageFigures }),
})

const staleCoverageModel = modifyFields(initialModel, {
  coverage: () => AsyncData.Stale({ error: 'unreachable', data: coverageFigures }),
})

const openMenuModel = modifyFields(initialModel, {
  themeMenu: () => ThemeMenu.open(Menu.init({ id: 'theme-menu' })).model,
})

const openTooltipModel = modifyFields(failedCoverageModel, {
  coverageTooltip: () =>
    Tooltip.update(
      Tooltip.init({ id: 'coverage-tooltip' }),
      Tooltip.Message.FocusedTrigger(),
    ).model,
})

const rail = selector('aside')
const dashboardLink = role('link', { name: 'Dashboard' })
const chainsLink = role('link', { name: 'Chains' })

describe('shell', () => {
  test('the rail names every section', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text('Dashboard')).toExist(),
      expect(text('Coins')).toExist(),
      expect(text('Exchanges')).toExist(),
      expect(text('Chains')).toExist(),
      expect(text('Workers')).toExist(),
    )
  })

  test('the current section is marked from the URL', () => {
    scene(
      { update, view },
      given(initialModel),
      inside(
        rail,
        expect(dashboardLink).toHaveAttr('href', dashboardRouter()),
        expect(dashboardLink).toHaveAttr('aria-current', 'page'),
        expect(chainsLink).toHaveAttr(
          'href',
          chainsUrl(defaultChainsQuery),
        ),
        expect(chainsLink).not.toHaveAttr('aria-current'),
      ),
    )
  })

  test('a failed coverage read offers a retry', () => {
    scene(
      { update, view },
      given(failedCoverageModel),
      expect(role('button', { name: 'Retry coverage' })).toExist(),
    )
  })

  test('a refresh keeps the previous figures on screen', () => {
    scene(
      { update, view },
      given(refreshingCoverageModel),
      expect(text('Coins')).toExist(),
      expect(text('41')).toExist(),
      expect(role('button', { name: 'Retry coverage' })).toBeAbsent(),
    )
  })

  test('a failed refresh keeps the figures, names them stale, and offers a retry', () => {
    scene(
      { update, view },
      given(staleCoverageModel),
      expect(text('41')).toExist(),
      expect(text('Totals may be out of date.')).toExist(),
      expect(role('button', { name: 'Retry coverage' })).toExist(),
    )
  })

  test('the theme toggle names its options', () => {
    scene(
      { update, view },
      given(openMenuModel),
      Mount.resolveAll(
        [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
        [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
      ),
      expect(role('menuitem', { name: 'Light' })).toExist(),
      expect(role('menuitem', { name: 'Dark' })).toExist(),
    )
  })

  test('a static control shows a tooltip', () => {
    scene(
      { update, view },
      given(openTooltipModel),
      Mount.resolve(
        Tooltip.AnchorTooltip,
        Tooltip.Message.CompletedAnchorTooltip(),
      ),
      expect(role('tooltip')).toExist(),
      expect(text('Reload the coverage figures')).toExist(),
    )
  })
})
