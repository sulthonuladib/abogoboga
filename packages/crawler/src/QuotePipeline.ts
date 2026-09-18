import type { CanonicalTick, PriceLevel } from "@lister/worker-contract"

/**
 * Fixed IDR executable-depth target shared by every exchange.
 */
export const idrVolumeTarget = 2_000_000 as const

/**
 * Stub USDT/IDR rate.
 *
 * This is the single call site every conversion flows through; replace it here
 * when a rate source exists.
 */
export const getUsdtToIdrRate = (): number => 16_000

/**
 * Quote currency of one exchange book.
 */
export type QuoteCurrency = "usdt" | "idr"

/**
 * Convert a book price into IDR.
 *
 * @param price - Price in the exchange's quote currency.
 * @param quote - The exchange's quote currency.
 * @returns The price in IDR.
 */
export const convertToIdr = (price: number, quote: QuoteCurrency): number =>
  quote === "idr" ? price : price * getUsdtToIdrRate()

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
 * Book prices are converted to IDR before the walk using the single rate source.
 * Buy lifts asks and sell hits bids. Returns `null` for a thin book so callers
 * leave the stored snapshot untouched.
 *
 * @param tick - The tick to convert.
 * @param quote - The exchange's quote currency.
 * @returns The executable quote, or `null` when either side is thin.
 */
export const processTick = (tick: CanonicalTick, quote: QuoteCurrency): ExecutableQuote | null => {
  const bidsIdr = tick.bids.map(([price, quantity]): PriceLevel => [convertToIdr(price, quote), quantity])
  const asksIdr = tick.asks.map(([price, quantity]): PriceLevel => [convertToIdr(price, quote), quantity])
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
