/**
 * Dashboard route: coverage counts plus the operator attention list.
 *
 * @module
 */

import { Chain, ChainLink, Cryptocurrency, Exchange, Market, pageWindow } from "@lister/api"
import { Effect, Layer } from "effect"
import { fragmentResponse, isHtmxRequest, pageResponse, route, unexpectedReason } from "../Http.ts"
import { Layout } from "../Layout.ts"
import { DashboardBody, type AttentionItem } from "../views/Dashboard.ts"

const dashboardRoute = route("GET", "/dashboard", (request) =>
  Effect.gen(function*() {
    const cryptocurrency = yield* Cryptocurrency
    const exchanges = yield* Exchange
    const chains = yield* Chain
    const markets = yield* Market
    const links = yield* ChainLink

    const coinStats = yield* cryptocurrency
      .stats({ page: 1, limit: 1, search: "", flag: "all", sortBy: "symbol", order: "asc" })
      .pipe(Effect.catchTag("CryptocurrencyError", unexpectedReason("Cryptocurrency", "stats")))

    const exchangeList = yield* exchanges
      .list({ window: pageWindow(1), limit: 1, search: "", searchBy: ["name"], orderBy: "id", order: "asc" })
      .pipe(Effect.catchTag("ExchangeError", unexpectedReason("Exchange", "list")))

    const chainList = yield* chains
      .list({ window: pageWindow(1), limit: 1, search: "", searchBy: ["name"], orderBy: "id", order: "asc" })
      .pipe(Effect.catchTag("ChainError", unexpectedReason("Chain", "list")))

    const allMarkets = yield* markets
      .list({})
      .pipe(Effect.catchTag("MarketError", unexpectedReason("Market", "list")))

    const allLinks = yield* links
      .list({})
      .pipe(Effect.catchTag("ChainLinkError", unexpectedReason("ChainLink", "list")))

    const fullStats = yield* cryptocurrency
      .stats({ page: 1, limit: -1, search: "", flag: "all", sortBy: "symbol", order: "asc" })
      .pipe(Effect.catchTag("CryptocurrencyError", unexpectedReason("Cryptocurrency", "stats")))

    const attention: Array<AttentionItem> = []

    for (const market of allMarkets) {
      if (!market.listed) {
        attention.push({
          kind: "unlisted",
          label: `market ${String(market.id)} is not listed (listed=false)`
        })
      }

      if (!market.tradeEnabled) {
        attention.push({
          kind: "trade-disabled",
          label: `market ${String(market.id)} has trading disabled (tradeEnabled=false)`
        })
      }
    }

    for (const link of allLinks) {
      if (!link.depositEnabled || !link.withdrawEnabled) {
        attention.push({
          kind: "link-disabled",
          label: `chain link ${String(link.id)} has disabled flags (deposit=${String(link.depositEnabled)} withdraw=${String(link.withdrawEnabled)})`
        })
      }
    }

    for (const row of fullStats.data) {
      if (row.markets < 2) {
        attention.push({
          kind: "under-mapped",
          label: `${row.symbol} has fewer than two markets (${String(row.markets)})`
        })
      }
    }

    const body = DashboardBody({
      counts: {
        coins: coinStats.meta.items,
        exchanges: exchangeList.meta.items,
        chains: chainList.meta.items,
        markets: allMarkets.length
      },
      attention: attention.slice(0, 50)
    })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: "Dashboard", active: "/dashboard", children: body }))
  }))

/**
 * The dashboard route in the SSR control plane.
 */
export const DashboardRoutes = Layer.mergeAll(dashboardRoute)
