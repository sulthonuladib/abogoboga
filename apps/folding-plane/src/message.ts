import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Menu, Tooltip } from '@foldkit/ui'

import { Coverage } from './coverage'
import * as Chains from './page/chains'
import * as Dashboard from './page/dashboard'
import * as ExchangeDetail from './page/exchangeDetail'
import * as Exchanges from './page/exchanges'

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedPersistTheme: {},
  GotThemeMenuMessage: { message: Menu.Message },
  ClickedRefreshCoverage: {},
  SettledFetchCoverage: { result: Schema.Result(Coverage, Schema.String) },
  GotCoverageTooltipMessage: { message: Tooltip.Message },
  GotChainsMessage: { message: Chains.Message },
  GotDashboardMessage: { message: Dashboard.Message },
  GotExchangesMessage: { message: Exchanges.Message },
  GotExchangeDetailMessage: { message: ExchangeDetail.Message },
})

export type Message = typeof Message.Type
