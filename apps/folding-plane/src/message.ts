import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Menu, Tooltip } from '@foldkit/ui'

import { Coverage } from './model'
import * as Chains from './page/chains'

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
})

export type Message = typeof Message.Type
