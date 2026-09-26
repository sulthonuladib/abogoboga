import type { BootstrapCoin, CanonicalTick } from "@lister/worker-contract"
import type { PartialDepthBook } from "./binance.ts"
import { partialDepthLevels } from "./binance.ts"

/**
 * Convert one complete Binance partial-depth update to the canonical tick.
 *
 * @param coin - Subscription identity associated with the stream name.
 * @param book - Binance's complete partial-depth update.
 * @param exchangeSlug - Exchange identity from the worker bootstrap context.
 * @param timestamp - Local epoch-millisecond receipt time.
 * @returns A canonical tick containing the best available levels from the feed.
 */
export const tickFromPartialBook = (
  coin: BootstrapCoin,
  book: PartialDepthBook,
  exchangeSlug: string,
  timestamp: number
): CanonicalTick => ({
  exchangeSlug,
  symbol: coin.symbol,
  coingeckoId: coin.coingeckoId,
  bids: [...book.bids].sort(([left], [right]) => right - left).slice(0, partialDepthLevels),
  asks: [...book.asks].sort(([left], [right]) => left - right).slice(0, partialDepthLevels),
  timestamp
})
