import type { BootstrapCoin, CanonicalTick, PriceLevel } from "@lister/worker-contract"

import type { OrderBookSnapshot } from "./gateio.ts"

/**
 * Best-first price levels for one side, capped at `limit`.
 *
 * Gate.io pushes snapshots already limited to the subscribed depth, but levels
 * are still normalized here so zero quantities are dropped and the best-first
 * ordering is guaranteed regardless of the exchange's response order.
 *
 * @param levels - Raw levels for one side.
 * @param order - `"desc"` for bids (highest first), `"asc"` for asks.
 * @param limit - Maximum number of levels to emit.
 */
export const topLevels = (
  levels: ReadonlyArray<PriceLevel>,
  order: "asc" | "desc",
  limit: number
): ReadonlyArray<PriceLevel> =>
  levels
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => (order === "desc" ? b - a : a - b))
    .slice(0, limit)
    .map(([price, quantity]): PriceLevel => [price, quantity])

/**
 * Build a canonical tick from a Gate.io order-book snapshot.
 *
 * @param snapshot - The decoded `spot.order_book` snapshot.
 * @param coin - Coin subscription the snapshot belongs to.
 * @param exchangeSlug - Exchange identity from argv.
 * @param timestamp - Epoch-millisecond timestamp.
 * @param depth - Maximum levels per side to emit.
 */
export const tickFor = (
  snapshot: OrderBookSnapshot,
  coin: BootstrapCoin,
  exchangeSlug: string,
  timestamp: number,
  depth: number
): CanonicalTick => ({
  exchangeSlug,
  symbol: coin.symbol,
  coingeckoId: coin.coingeckoId,
  bids: topLevels(snapshot.bids, "desc", depth),
  asks: topLevels(snapshot.asks, "asc", depth),
  timestamp
})
