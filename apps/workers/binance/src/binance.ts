import { Schema } from "effect"

/**
 * Binance Spot WebSocket market-data wire types and endpoint constants.
 *
 * Binance carries prices and quantities as strings; the schemas below decode
 * them to numbers so nothing else in the worker touches stringly-typed levels.
 *
 * @module
 */

/**
 * Combined market-data WebSocket endpoint. It wraps each partial-depth payload
 * with its stream name, identifying the pair because the payload itself does
 * not contain a symbol.
 */
export const wsUrl = "wss://data-stream.binance.vision/stream"

/**
 * Number of top price levels provided on each partial-depth update.
 */
export const partialDepthLevels = 20 as const

/**
 * Partial-depth stream update speed, chosen to match Binance's 100ms stream.
 */
export const partialDepthUpdateSpeed = "100ms" as const

/**
 * One Binance price level `[price, quantity]`, decoded from strings.
 */
const BinancePriceLevel = Schema.Tuple([Schema.FiniteFromString, Schema.FiniteFromString])

/**
 * Complete top-of-book snapshot carried by a Binance partial-depth event.
 */
export const PartialDepthBook = Schema.Struct({
  lastUpdateId: Schema.Int,
  bids: Schema.Array(BinancePriceLevel),
  asks: Schema.Array(BinancePriceLevel)
})

/**
 * Complete top-of-book snapshot carried by a Binance partial-depth event.
 */
export type PartialDepthBook = typeof PartialDepthBook.Type

/**
 * One message from Binance's combined partial-depth WebSocket endpoint.
 */
export const PartialDepthMessage = Schema.Struct({
  stream: Schema.NonEmptyString,
  data: PartialDepthBook
})

/**
 * One message from Binance's combined partial-depth WebSocket endpoint.
 */
export type PartialDepthMessage = typeof PartialDepthMessage.Type

/**
 * A live control request sent over the combined WebSocket connection.
 */
export const ControlRequest = Schema.Struct({
  method: Schema.Literals(["SUBSCRIBE", "UNSUBSCRIBE"]),
  params: Schema.NonEmptyArray(Schema.String),
  id: Schema.Int
})

/**
 * A live control request sent over the combined WebSocket connection.
 */
export type ControlRequest = typeof ControlRequest.Type

/**
 * Normalize a bootstrap symbol to Binance pair form (`BTCUSDT`).
 *
 * Binance pairs are uppercase with no separator and use the USDT quote here.
 * The symbol stored elsewhere in the system may be base-only (`BTC`), carry a
 * separator (`BTC/USDT`, `BTC-USDT`), or already include the quote. Normalize
 * those forms to exactly one `USDT` suffix.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string => {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const base = clean.endsWith("USDT") ? clean.slice(0, -4) : clean

  return `${base}USDT`
}

/**
 * Partial-depth stream name for a pair, using Binance's top-20 100ms feed.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const partialDepthStreamFor = (symbol: string): string =>
  `${normalizeSymbol(symbol).toLowerCase()}@depth${String(partialDepthLevels)}@${partialDepthUpdateSpeed}`
