import type { BootstrapCoin, CanonicalTick, PriceLevel } from "@lister/worker-contract"

import type { DepthLevel, LimitDepths } from "./mexc.ts"

/**
 * Convert one decoded protobuf level to a `[price, quantity]` pair.
 *
 * @param level - Raw level from the decoded snapshot.
 */
const priceLevel = (level: DepthLevel): PriceLevel | null => {
  const price = Number(level.price)
  const quantity = Number(level.quantity)

  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null

  return [price, quantity]
}

/**
 * Best-first price levels for one side, capped at `limit`.
 *
 * MEXC pushes snapshots already ordered, but levels are normalized here so zero
 * quantities are dropped and best-first ordering is guaranteed regardless of
 * the exchange's response order.
 *
 * @param levels - Decoded levels for one side.
 * @param order - `"desc"` for bids (highest first), `"asc"` for asks.
 * @param limit - Maximum number of levels to emit.
 */
export const topLevels = (
  levels: ReadonlyArray<DepthLevel>,
  order: "asc" | "desc",
  limit: number
): ReadonlyArray<PriceLevel> => {
  const cleaned: Array<PriceLevel> = []

  for (const level of levels) {
    const converted = priceLevel(level)

    if (converted !== null && converted[1] > 0) cleaned.push(converted)
  }

  cleaned.sort(([left], [right]) => (order === "desc" ? right - left : left - right))

  return cleaned.slice(0, limit)
}

/**
 * Build a canonical tick from a decoded MEXC limit-depth snapshot.
 *
 * @param depths - The decoded protobuf limit-depth payload.
 * @param coin - Coin subscription the snapshot belongs to.
 * @param exchangeSlug - Exchange identity from the worker bootstrap context.
 * @param timestamp - Epoch-millisecond timestamp.
 * @param depth - Maximum levels per side to emit.
 */
export const tickFromDepths = (
  depths: LimitDepths,
  coin: BootstrapCoin,
  exchangeSlug: string,
  timestamp: number,
  depth: number
): CanonicalTick => ({
  exchangeSlug,
  symbol: coin.symbol,
  coingeckoId: coin.coingeckoId,
  bids: topLevels(depths.bids, "desc", depth),
  asks: topLevels(depths.asks, "asc", depth),
  timestamp
})
