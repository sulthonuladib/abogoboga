import type { CanonicalTick, PriceLevel } from "@lister/worker-contract"

/**
 * Fixed IDR executable-depth target shared by every exchange.
 */
export const idrVolumeTarget = 2_000_000 as const

/**
 * Quote currency of one exchange book.
 */
export type QuoteCurrency = "usdt" | "idr"

/**
 * Convert a book price into IDR.
 *
 * @param price - Price in the exchange's quote currency.
 * @param quote - The exchange's quote currency.
 * @param rate - Current USDT→IDR rate, applied only to `usdt` books.
 * @returns The price in IDR.
 */
export const convertToIdr = (price: number, quote: QuoteCurrency, rate: number): number =>
  quote === "idr" ? price : price * rate

/**
 * Result of walking one book side best-first to the volume target.
 */
export interface BookWalk {
  /** Price of the marginal level that reached the target. */
  readonly price: number
  /** Cumulative base amount consumed. */
  readonly amount: number
  /** Cumulative quote value consumed in IDR. */
  readonly value: number
}

/**
 * Walk one side best-first, accumulating `price * quantity` until the cumulative
 * value reaches the target.
 *
 * @param levelsIdr - Price levels already converted to IDR, best-first.
 * @param target - Cumulative IDR value required to consider the side executable.
 * @returns The marginal walk result, or `null` when the side totals below the target.
 */
export const walkBookSide = (
  levelsIdr: ReadonlyArray<PriceLevel>,
  target: number = idrVolumeTarget
): BookWalk | null => {
  let value = 0
  let amount = 0
  let price = 0

  for (const [levelPrice, quantity] of levelsIdr) {
    if (!(levelPrice > 0) || !(quantity > 0)) continue

    price = levelPrice
    amount += quantity
    value += levelPrice * quantity

    if (value >= target) return { price, amount, value }
  }

  return null
}

/**
 * Executable quote derived from one tick: buy lifts asks, sell hits bids.
 */
export interface ExecutableQuote {
  /** Marginal ask price in IDR (the buy price). */
  readonly buyPrice: number
  /** Marginal bid price in IDR (the sell price). */
  readonly sellPrice: number
  /** Cumulative base amount bought to reach the target. */
  readonly buyAmount: number
  /** Cumulative base amount sold to reach the target. */
  readonly sellAmount: number
}

/**
 * Convert a canonical tick into an executable quote.
 *
 * Book prices are converted to IDR before the walk using the supplied rate.
 * Buy lifts asks and sell hits bids. Returns `null` for a thin book so callers
 * leave the stored opportunity side untouched.
 *
 * @param tick - The tick to convert.
 * @param quote - The exchange's quote currency.
 * @param rate - Current USDT→IDR rate for `usdt` books.
 * @returns The executable quote, or `null` when either side is thin.
 */
export const processTick = (
  tick: CanonicalTick,
  quote: QuoteCurrency,
  rate: number
): ExecutableQuote | null => {
  const bidsIdr = tick.bids.map(([price, quantity]): PriceLevel => [convertToIdr(price, quote, rate), quantity])
  const asksIdr = tick.asks.map(([price, quantity]): PriceLevel => [convertToIdr(price, quote, rate), quantity])
  const bidWalk = walkBookSide(bidsIdr)
  const askWalk = walkBookSide(asksIdr)

  if (bidWalk === null || askWalk === null) return null

  return {
    buyPrice: askWalk.price,
    sellPrice: bidWalk.price,
    buyAmount: askWalk.amount,
    sellAmount: bidWalk.amount
  }
}
