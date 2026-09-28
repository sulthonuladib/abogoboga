import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { Menu, Tooltip } from '@foldkit/ui'

import { CoverageData } from './coverage'
import * as ChainDetail from './page/chainDetail'
import * as Chains from './page/chains'
import * as CoinRoutes from './page/coinRoutes'
import * as Coins from './page/coins'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'
import * as Workers from './page/workers'
import { AppRoute } from './route'

// THEME

export const Theme = Schema.Literals(['Light', 'Dark'])
export type Theme = typeof Theme.Type

/**
 * The named color preset. `Default` is this app's own warm theme and renders
 * no overrides; the rest are shadcn base colors, each carrying its own light
 * and dark variable sets behind `data-preset` in the stylesheet.
 */
export const Preset = Schema.Literals(['Default', 'Zinc', 'Slate', 'Stone', 'Neutral', 'Gray'])
export type Preset = typeof Preset.Type

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  theme: Theme,
  themeMenu: Menu.Model,
  preset: Preset,
  presetMenu: Menu.Model,
  coverage: CoverageData.schema,
  coverageTooltip: Tooltip.Model,
  chains: Chains.Model,
  chainDetail: ChainDetail.Model,
  coins: Coins.Model,
  coinRoutes: CoinRoutes.Model,
  dashboard: Dashboard.Model,
  exchanges: Exchanges.Model,
  exchangeDetail: ExchangeDetail.Model,
  workers: Workers.Model,
  hasNavigated: Schema.Boolean,
})

export type Model = typeof Model.Type

// INIT

export const init = (theme: Theme, preset: Preset): Model => ({
  route: AppRoute.Dashboard(),
  theme,
  themeMenu: Menu.init({ id: 'theme-menu' }),
  preset,
  presetMenu: Menu.init({ id: 'preset-menu' }),
  coverage: AsyncData.Idle(),
  coverageTooltip: Tooltip.init({ id: 'coverage-tooltip' }),
  chains: Chains.initialModel,
  chainDetail: ChainDetail.initFor(0),
  coins: Coins.initialModel,
  coinRoutes: CoinRoutes.initFor(0),
  dashboard: Dashboard.initialModel,
  exchanges: Exchanges.initialModel,
  exchangeDetail: ExchangeDetail.initFor(0),
  workers: Workers.initialModel,
  hasNavigated: false,
})

export const initialModel: Model = init('Light', 'Default')
