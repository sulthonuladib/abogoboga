import { Schema } from "effect"

/**
 * Gate.io spot market-data wire types and endpoint constants.
 *
 * These mirror the Gate.io spot WebSocket v4 documentation. Gate.io carries
 * prices and quantities as strings; the schemas below decode them to numbers so
 * nothing else in the worker touches stringly-typed levels.
 *
 * @module
 */

/**
 * Spot WebSocket endpoint. The `/ws/v4` path accepts live
 * `subscribe`/`unsubscribe` control messages over a single connection, which is
 * how this worker adds and removes pairs without reconnecting.
 */
export const wsUrl = "wss://api.gateio.ws/ws/v4/"

/**
 * Spot order-book channel name. Unlike Binance's diff-depth stream, Gate.io
 * pushes full limited-depth snapshots on this channel, so no REST snapshot or
 * local-book gap tracking is required.
 */
export const orderBookChannel = "spot.order_book"

/**
 * Number of book levels requested per pair. Gate.io accepts 5/10/20/50/100;
 * 50 matches the emit depth used by the crawl pipeline.
 */
export const depthLevels = "50"

/**
 * Snapshot push interval. `1000ms` matches the historical Gate.io worker and
 * keeps full-snapshot traffic light; `100ms` is the higher-cadence alternative.
 */
export const depthInterval = "1000ms"

/**
 * One Gate.io price level `[price, quantity]`, decoded from strings.
 */
const GatePriceLevel = Schema.Tuple([Schema.FiniteFromString, Schema.FiniteFromString])

/**
 * A limited-depth order-book snapshot pushed by `spot.order_book`.
 *
 * `s` is the currency pair (`BTC_USDT`); `bids`/`asks` carry absolute
 * quantities for the requested number of levels. `t` and `lastUpdateId` are
 * ignored here because every push is a complete snapshot.
 */
export const OrderBookSnapshot = Schema.Struct({
  s: Schema.String,
  bids: Schema.Array(GatePriceLevel),
  asks: Schema.Array(GatePriceLevel)
})

/**
 * A limited-depth order-book snapshot pushed by `spot.order_book`.
 */
export type OrderBookSnapshot = typeof OrderBookSnapshot.Type

/**
 * A full `spot.order_book` update envelope.
 *
 * `time_ms` is the server-message timestamp in epoch milliseconds, used as the
 * canonical tick timestamp.
 */
export const OrderBookUpdate = Schema.Struct({
  time_ms: Schema.Int,
  channel: Schema.Literal("spot.order_book"),
  event: Schema.Literal("update"),
  result: OrderBookSnapshot
})

/**
 * A full `spot.order_book` update envelope.
 */
export type OrderBookUpdate = typeof OrderBookUpdate.Type

/**
 * A live control request sent over the `/ws/v4` connection.
 */
export const ControlRequest = Schema.Struct({
  time: Schema.Int,
  channel: Schema.Literal("spot.order_book"),
  event: Schema.Literals(["subscribe", "unsubscribe"]),
  payload: Schema.Tuple([Schema.String, Schema.String, Schema.String])
})

/**
 * A live control request sent over the `/ws/v4` connection.
 */
export type ControlRequest = typeof ControlRequest.Type

/**
 * Quote currency every Gate.io spot book is denominated in.
 */
const quote = "USDT"

/**
 * Normalize a bootstrap symbol to Gate.io pair form (`BTC_USDT`).
 *
 * Gate.io pairs separate the base from the `USDT` quote with an underscore,
 * while the symbol stored elsewhere in the system may be the base only (`BTC`)
 * or an already paired form with no separator (`BTCUSDT`) or another separator
 * (`BTC/USDT`, `BTC-USDT`). Strip non-alphanumeric characters, drop any
 * trailing quote, then re-append it with Gate.io's underscore separator.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string => {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const base = clean.endsWith(quote) ? clean.slice(0, -quote.length) : clean

  return `${base}_${quote}`
}
