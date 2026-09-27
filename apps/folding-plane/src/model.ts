import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Menu, Tooltip } from '@foldkit/ui'

import { CoverageData } from './coverage'
import * as Chains from './page/chains'
import * as Dashboard from './page/dashboard'
import { AppRoute } from './route'

// THEME

export const Theme = Schema.Literals(['Light', 'Dark'])
export type Theme = typeof Theme.Type

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  theme: Theme,
  themeMenu: Menu.Model,
  coverage: CoverageData.schema,
  coverageTooltip: Tooltip.Model,
  chains: Chains.Model,
  dashboard: Dashboard.Model,
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
  dashboard: Dashboard.initialModel,
  hasNavigated: false,
})

export const initialModel: Model = init('Light')
