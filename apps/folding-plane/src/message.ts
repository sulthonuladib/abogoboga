import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Menu, Tooltip } from '@foldkit/ui'

import { Coverage } from './coverage'
import * as ChainDetail from './page/chainDetail'
import * as Chains from './page/chains'
import * as CoinRoutes from './page/coinRoutes'
import * as Coins from './page/coins'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'
import * as Workers from './page/workers'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedPersistTheme: {},
  CompletedPersistPreset: {},
  GotThemeMenuMessage: { message: Menu.Message },
  GotPresetMenuMessage: { message: Menu.Message },
  ClickedRefreshCoverage: {},
  SettledFetchCoverage: { result: Schema.Result(Coverage, Schema.String) },
  GotCoverageTooltipMessage: { message: Tooltip.Message },
  GotChainsMessage: { message: Chains.Message },
  GotChainDetailMessage: { message: ChainDetail.Message },
  GotCoinsMessage: { message: Coins.Message },
  GotCoinRoutesMessage: { message: CoinRoutes.Message },
  GotDashboardMessage: { message: Dashboard.Message },
  GotExchangesMessage: { message: Exchanges.Message },
  GotExchangeDetailMessage: { message: ExchangeDetail.Message },
  GotWorkersMessage: { message: Workers.Message },
})

export type Message = typeof Message.Type
