import type { BootstrapCoin, CanonicalTick, PriceLevel } from "@lister/worker-contract"

import type { OrderBook, OrderBookLevel } from "./indodax.ts"

/**
 * Base coin of an Indodax pair: `btcidr` -> `btc`.
 *
 * @param pair - Normalized Indodax pair.
 */
const baseOf = (pair: string): string => pair.replace(/idr$/i, "")

/**
 * Convert one raw Indodax level to a `[price, quantity]` pair.
 *
 * Indodax names the base quantity after the base coin (`btc_volume` on
 * `btcidr`), so the key is derived from the pair. Levels whose price or
 * quantity is not finite are dropped.
 *
 * @param base - Base coin of the pair, used to find the quantity field.
 * @param level - Raw level record from the channel payload.
 */
const priceLevel = (base: string, level: OrderBookLevel): PriceLevel | null => {
  const price = Number(level["price"])
  const quantity = Number(level[`${base}_volume`])

  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null

  return [price, quantity]
}

/**
 * Best-first price levels for one side, capped at `limit`.
 *
 * Indodax pushes snapshots already ordered, but levels are normalized here so
 * zero quantities are dropped and best-first ordering is guaranteed regardless
 * of the exchange's response order.
 *
 * @param base - Base coin of the pair, used to find the quantity field.
 * @param levels - Raw levels for one side.
 * @param order - `"desc"` for bids (highest first), `"asc"` for asks.
 * @param limit - Maximum number of levels to emit.
 */
export const topLevels = (
  base: string,
  levels: ReadonlyArray<OrderBookLevel>,
  order: "asc" | "desc",
  limit: number
): ReadonlyArray<PriceLevel> => {
  const cleaned: Array<PriceLevel> = []

  for (const level of levels) {
    const converted = priceLevel(base, level)

    if (converted !== null && converted[1] > 0) cleaned.push(converted)
  }

  cleaned.sort(([left], [right]) => (order === "desc" ? right - left : left - right))

  return cleaned.slice(0, limit)
}

/**
 * Build a canonical tick from an Indodax order-book snapshot.
 *
 * @param book - The decoded order-book channel snapshot.
 * @param coin - Coin subscription the snapshot belongs to.
 * @param exchangeSlug - Exchange identity from the worker bootstrap context.
 * @param timestamp - Epoch-millisecond timestamp.
 * @param depth - Maximum levels per side to emit.
 */
export const tickFor = (
  book: OrderBook,
  coin: BootstrapCoin,
  exchangeSlug: string,
  timestamp: number,
  depth: number
): CanonicalTick => {
  const base = baseOf(book.pair)

  return {
    exchangeSlug,
    symbol: coin.symbol,
    coingeckoId: coin.coingeckoId,
    bids: topLevels(base, book.bid, "desc", depth),
    asks: topLevels(base, book.ask, "asc", depth),
    timestamp
  }
}
