import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Menu, Tooltip } from '@foldkit/ui'

import * as Chains from './page/chains'
import { AppRoute } from './route'

// THEME

export const Theme = Schema.Literals(['Light', 'Dark'])
export type Theme = typeof Theme.Type

// COVERAGE

/**
 * The figures the rail shows on every page. One Command reads them all, so the
 * rail and a page never disagree about what the catalogue holds.
 */
export const Coverage = Schema.Struct({
  coins: Schema.Int,
  exchanges: Schema.Int,
  chains: Schema.Int,
  markets: Schema.Int,
  runningWorkers: Schema.Int,
  totalWorkers: Schema.Int,
  reconnectingShards: Schema.Int,
})

export type Coverage = typeof Coverage.Type

export const CoverageData = AsyncData.Schema(Coverage, Schema.String)

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  theme: Theme,
  themeMenu: Menu.Model,
  coverage: CoverageData.schema,
  coverageTooltip: Tooltip.Model,
  chains: Chains.Model,
  hasNavigated: Schema.Boolean,
})

export type Model = typeof Model.Type

// INIT

export const init = (theme: Theme): Model => ({
  route: AppRoute.Dashboard(),
  theme,
  themeMenu: Menu.init({ id: 'theme-menu' }),
  coverage: AsyncData.Idle(),
  coverageTooltip: Tooltip.init({ id: 'coverage-tooltip' }),
  chains: Chains.initialModel,
  hasNavigated: false,
})

export const initialModel: Model = init('Light')
