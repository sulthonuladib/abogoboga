import type { BootstrapCoin, CanonicalTick, PriceLevel } from "@lister/worker-contract"

import type { OrderBookMessage } from "./kucoin.ts"

/**
 * Best-first price levels for one side, capped at `limit`.
 *
 * KuCoin pushes complete snapshots already limited to 50 levels, but levels are
 * normalized here so zero quantities are dropped and best-first ordering is
 * guaranteed regardless of the exchange's response order.
 *
 * @param levels - Raw levels for one side.
 * @param order - `"desc"` for bids (highest first), `"asc"` for asks.
 * @param limit - Maximum number of levels to emit.
 */
export const topLevels = (
  levels: ReadonlyArray<PriceLevel>,
  order: "asc" | "desc",
  limit: number
): ReadonlyArray<PriceLevel> => {
  const cleaned: Array<PriceLevel> = []

  for (const level of levels) {
    if (level[1] > 0) cleaned.push(level)
  }

  cleaned.sort(([left], [right]) => (order === "desc" ? right - left : left - right))

  return cleaned.slice(0, limit)
}

/**
 * Build a canonical tick from a KuCoin level-50 snapshot.
 *
 * @param book - The decoded order-book channel payload.
 * @param coin - Coin subscription the snapshot belongs to.
 * @param exchangeSlug - Exchange identity from the worker bootstrap context.
 * @param timestamp - Epoch-millisecond timestamp.
 * @param depth - Maximum levels per side to emit.
 */
export const tickFor = (
  book: OrderBookMessage["data"],
  coin: BootstrapCoin,
  exchangeSlug: string,
  timestamp: number,
  depth: number
): CanonicalTick => ({
  exchangeSlug,
  symbol: coin.symbol,
  coingeckoId: coin.coingeckoId,
  bids: topLevels(book.bids, "desc", depth),
  asks: topLevels(book.asks, "asc", depth),
  timestamp
})
