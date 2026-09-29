import { canTransfer, type ChainLinkFlags } from "@lister/domain"
import { type BootstrapCoin } from "@lister/worker-contract"
import type { OpportunityKey } from "./Opportunities.ts"

/**
 * One `exchange_cryptocurrency` row joined to one of its chain links, as the
 * route scan consumes it.
 *
 * `listed` and `tradeEnabled` are carried on every row because a market's
 * route eligibility depends on them; a market is one
 * `(exchangeId, cryptocurrencyId)` pair and keeps one set of chain links.
 */
export interface RouteLinkRow {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Database cryptocurrency id. */
  readonly cryptocurrencyId: number
  /**
   * Exchange-specific trading symbol (`exchange_cryptocurrency.exchange_symbol`)
   * carried in worker bootstrap messages. Exchanges name the same coin
   * differently, so this is never the canonical `cryptocurrency.symbol`.
   */
  readonly symbol: string
  /** CoinGecko id carried in worker bootstrap messages. */
  readonly coingeckoId: string
  /** Whether the exchange lists the coin. */
  readonly listed: boolean
  /** Whether the exchange has trading enabled for the coin. */
  readonly tradeEnabled: boolean
  /** Chain the link is on. */
  readonly chainId: number
  /** Whether the exchange can withdraw on the chain. */
  readonly withdrawEnabled: boolean
  /** Whether the exchange can deposit on the chain. */
  readonly depositEnabled: boolean
}

/**
 * One exchange's route-eligible subscription set.
 */
export interface RouteSubscription {
  /** Database exchange id. */
  readonly exchangeId: number
  /** Coins the exchange should subscribe to, in stable order. */
  readonly coins: ReadonlyArray<BootstrapCoin>
}

/**
 * Result of one route scan: the per-exchange subscription sets and the ordered
 * opportunity pairs the matrix should contain.
 */
export interface RouteScanResult {
  /** Route-eligible coins per active exchange, in stable order. */
  readonly subscriptions: ReadonlyArray<RouteSubscription>
  /** Ordered `(cryptocurrencyId, buyExchangeId, sellExchangeId)` rows. */
  readonly pairs: ReadonlyArray<OpportunityKey>
}

interface Market {
  readonly exchangeId: number
  readonly cryptocurrencyId: number
  readonly symbol: string
  readonly coingeckoId: string
  readonly links: ReadonlyArray<ChainLinkFlags>
}

const marketKey = (exchangeId: number, cryptocurrencyId: number): string =>
  `${exchangeId}:${cryptocurrencyId}`

const pairKey = (key: OpportunityKey): string =>
  `${key.cryptocurrencyId}:${key.buyExchangeId}:${key.sellExchangeId}`

/**
 * Build the listed-and-trade-enabled markets for the active exchanges.
 *
 * Rows for an inactive exchange are dropped, as are rows whose market is not
 * listed or has trading disabled. Multiple chain links for one market collapse
 * into one link set.
 */
const activeMarkets = (
  rows: ReadonlyArray<RouteLinkRow>,
  activeExchangeIds: ReadonlyArray<number>
): ReadonlyArray<Market> => {
  const active = new Set(activeExchangeIds)
  const markets = new Map<string, Market>()

  for (const row of rows) {
    if (!active.has(row.exchangeId)) continue

    if (!row.listed || !row.tradeEnabled) continue

    const key = marketKey(row.exchangeId, row.cryptocurrencyId)
    const existing = markets.get(key)

    const links: ReadonlyArray<ChainLinkFlags> = [
      {
        chainId: row.chainId,
        withdrawEnabled: row.withdrawEnabled,
        depositEnabled: row.depositEnabled
      }
    ]

    if (existing === undefined) {
      markets.set(key, {
        exchangeId: row.exchangeId,
        cryptocurrencyId: row.cryptocurrencyId,
        symbol: row.symbol,
        coingeckoId: row.coingeckoId,
        links
      })
    } else {
      markets.set(key, { ...existing, links: [...existing.links, ...links] })
    }
  }

  return [...markets.values()]
}

/**
 * Cross-exchange route scan from database truth.
 *
 * A coin is route-eligible on an active exchange when there is another active
 * exchange and a chain carrying value in either direction. An ordered pair
 * `(buy, sell)` exists when the buy exchange can withdraw to the sell exchange
 * on a shared chain.
 *
 * @param rows - Exchange/coin/chain rows from the database.
 * @param activeExchangeIds - The exchanges the gate currently considers active.
 * @returns The per-exchange subscription sets and the ordered pairs.
 */
export const scanRoutes = (
  rows: ReadonlyArray<RouteLinkRow>,
  activeExchangeIds: ReadonlyArray<number>
): RouteScanResult => {
  const markets = activeMarkets(rows, activeExchangeIds)
  const byCoin = new Map<number, ReadonlyArray<Market>>()

  for (const market of markets) {
    const current = byCoin.get(market.cryptocurrencyId) ?? []

    byCoin.set(market.cryptocurrencyId, [...current, market])
  }

  const subscriptions: Array<RouteSubscription> = []
  const pairs: Array<OpportunityKey> = []
  const seenPairs = new Set<string>()

  for (const exchangeId of [...activeExchangeIds].sort((a, b) => a - b)) {
    const onExchange = markets.filter((market) => market.exchangeId === exchangeId)
    const coins: Array<BootstrapCoin> = []

    for (const market of [...onExchange].sort((a, b) => a.symbol.localeCompare(b.symbol))) {
      const others = (byCoin.get(market.cryptocurrencyId) ?? []).filter(
        (candidate) => candidate.exchangeId !== market.exchangeId
      )

      const eligible = others.some((other) =>
        canTransfer(market.links, other.links) || canTransfer(other.links, market.links)
      )

      if (eligible) {
        coins.push({ symbol: market.symbol, coingeckoId: market.coingeckoId })
      }
    }

    subscriptions.push({ exchangeId, coins })
  }

  for (const marketsOfCoin of byCoin.values()) {
    for (const from of marketsOfCoin) {
      for (const to of marketsOfCoin) {
        if (from.exchangeId === to.exchangeId) continue

        if (!canTransfer(from.links, to.links)) continue

        const key: OpportunityKey = {
          cryptocurrencyId: from.cryptocurrencyId,
          buyExchangeId: from.exchangeId,
          sellExchangeId: to.exchangeId
        }

        if (seenPairs.has(pairKey(key))) continue

        seenPairs.add(pairKey(key))
        pairs.push(key)
      }
    }
  }

  pairs.sort((a, b) =>
    a.cryptocurrencyId - b.cryptocurrencyId ||
    a.buyExchangeId - b.buyExchangeId ||
    a.sellExchangeId - b.sellExchangeId
  )

  return { subscriptions, pairs }
}
