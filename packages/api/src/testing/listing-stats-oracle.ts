import {
  canTransfer,
  type ChainId,
  type ChainLink,
  type Cryptocurrency as CryptocurrencyModel,
  type ExchangeId,
  type Market
} from "@lister/domain"
import type {
  CryptocurrencySearchField,
  CryptocurrencyStat,
  CryptocurrencyStatsFlag,
  CryptocurrencyStatsPage,
  CryptocurrencyStatsSort
} from "../Cryptocurrency.ts"
import { defaultStatsSearchBy } from "../Cryptocurrency.ts"
import { paginationMeta } from "../Pagination.ts"

/**
 * In-memory listing-stats oracle.
 *
 * This module is the frozen, pre-store implementation of the coin listing
 * stats: it loads every coin, market, and chain link and does all filtering,
 * sorting, counting, and slicing in memory. It is kept only as the
 * characterization oracle for the SQL stats query in
 * `CryptocurrencyStore.listStats`, so the two can be compared row for row.
 * Production code must not import it.
 *
 * @module
 */

/**
 * Raw rows required to compute listing coverage.
 */
export type ListingStatsSources = {
  /** Coins matching the requested search text. */
  readonly coins: ReadonlyArray<CryptocurrencyModel>
  /** Every market assignment. */
  readonly markets: ReadonlyArray<Market>
  /** Every chain link. */
  readonly links: ReadonlyArray<ChainLink>
}

/**
 * Page-based stats query accepted by the oracle.
 *
 * Mirrors the legacy payload shape so characterization cases can be written
 * against it independently of the keyset window the API now accepts.
 */
export type ListingStatsOracleQuery = {
  readonly page: number
  readonly limit: number
  readonly search: string
  readonly searchBy?: ReadonlyArray<CryptocurrencySearchField> | undefined
  readonly flag: CryptocurrencyStatsFlag
  readonly sortBy: CryptocurrencyStatsSort
  readonly order: "asc" | "desc"
  readonly exchangeId?: ExchangeId | undefined
  readonly chainId?: ChainId | undefined
}

const countBlockedRoutes = (
  marketsLinks: ReadonlyArray<ReadonlyArray<{ chainId: number; withdrawEnabled: boolean; depositEnabled: boolean }>>
): number => {
  if (marketsLinks.length < 2) return 0

  let blocked = 0

  for (const [i, source] of marketsLinks.entries()) {
    for (const [j, target] of marketsLinks.entries()) {
      if (i === j) continue

      const forward = canTransfer(source, target)
      const backward = canTransfer(target, source)

      // Ordered pair (i -> j) counts as blocked only when the unordered route
      // status is `none`: no shared enabled chain in either direction.
      if (!forward && !backward) blocked += 1
    }
  }

  return blocked
}

/**
 * Build the filtered, sorted, and paginated listing-stats page from raw rows.
 *
 * Pure: every count is recomputed from the supplied rows, never trusted from
 * callers. Thin coverage rows (`blocked`/`single` flags) use the same
 * definitions as the legacy JSON API.
 *
 * @param sources - Coins, markets, and chain links to compute coverage from.
 * @param query - Filters, sort, and pagination for the page.
 * @returns The stats rows plus pagination metadata.
 */
export function buildListingStatsOracle(
  sources: ListingStatsSources,
  query: ListingStatsOracleQuery
): CryptocurrencyStatsPage {
  const marketsByCoin = new Map<number, Array<Market>>()

  for (const market of sources.markets) {
    const list = marketsByCoin.get(market.cryptocurrencyId) ?? []

    list.push(market)
    marketsByCoin.set(market.cryptocurrencyId, list)
  }

  const linksByMarket = new Map<number, Array<ChainLink>>()

  for (const link of sources.links) {
    const list = linksByMarket.get(link.exchangeCryptocurrencyId) ?? []

    list.push(link)
    linksByMarket.set(link.exchangeCryptocurrencyId, list)
  }

  const rows: Array<CryptocurrencyStat> = []

  for (const coin of sources.coins) {
    const markets = marketsByCoin.get(coin.id) ?? []
    const marketsLinks = markets.map((market) => linksByMarket.get(market.id) ?? [])
    const distinctChains = new Set<number>()

    for (const links of marketsLinks) {
      for (const link of links) distinctChains.add(link.chainId)
    }

    rows.push(
      Object.assign({}, coin, {
        markets: markets.length,
        chains: distinctChains.size,
        blocked: countBlockedRoutes(marketsLinks)
      })
    )
  }

  const filtered = rows.filter((row) => {
    if (query.exchangeId !== undefined) {
      const wanted = query.exchangeId
      const markets = marketsByCoin.get(row.id) ?? []

      if (!markets.some((market) => market.exchangeId === wanted)) return false
    }

    if (query.chainId !== undefined) {
      const wanted = query.chainId
      const markets = marketsByCoin.get(row.id) ?? []

      const carriesChain = markets.some((market) => {
        const links = linksByMarket.get(market.id) ?? []

        return links.some((link) => link.chainId === wanted)
      })

      if (!carriesChain) return false
    }

    if (query.flag === "blocked") return row.blocked > 0

    if (query.flag === "single") return row.markets <= 1

    return true
  })

  const direction = query.order === "asc" ? 1 : -1

  filtered.sort((a, b) => {
    if (query.sortBy === "symbol") return a.symbol.localeCompare(b.symbol) * direction

    return (a[query.sortBy] - b[query.sortBy]) * direction || a.symbol.localeCompare(b.symbol)
  })

  const total = filtered.length
  const offset = (query.page - 1) * query.limit
  const data = query.limit === -1 ? filtered : filtered.slice(offset, offset + query.limit)

  return {
    data,
    meta: paginationMeta({
      items: total,
      page: query.page,
      limit: query.limit,
      search: query.search,
      searchBy: (query.searchBy ?? defaultStatsSearchBy).join(","),
      order: query.order,
      orderBy: query.sortBy
    })
  }
}
