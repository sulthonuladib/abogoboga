import { Schema } from "effect"

/**
 * Binance spot market-data wire types and endpoint constants.
 *
 * These mirror the Binance spot WebSocket/REST documentation. Binance carries
 * prices and quantities as strings; the schemas below decode them to numbers so
 * nothing else in the worker touches stringly-typed levels.
 *
 * @module
 */

/**
 * Raw market-data WebSocket endpoint. The `/ws` path accepts live
 * `SUBSCRIBE`/`UNSUBSCRIBE` control messages over a single connection, which is
 * how this worker adds and removes pairs without reconnecting.
 */
export const wsUrl = "wss://data-stream.binance.vision/ws"

/**
 * Market-data REST base used to fetch order-book snapshots.
 */
export const restBaseUrl = "https://data-api.binance.vision"

/**
 * Diff-depth stream suffix (1000ms updates) appended to a lowercased pair.
 */
export const depthStreamSuffix = "@depth"

/**
 * Number of levels requested from the depth snapshot endpoint. Binance accepts
 * up to 5000; 1000 keeps the local book deep without oversized responses.
 */
export const snapshotLimit = 1000

/**
 * One Binance price level `[price, quantity]`, decoded from strings.
 */
const BinancePriceLevel = Schema.Tuple([Schema.FiniteFromString, Schema.FiniteFromString])

/**
 * A depth snapshot returned by `GET /api/v3/depth`.
 */
export const DepthSnapshot = Schema.Struct({
  lastUpdateId: Schema.Int,
  bids: Schema.Array(BinancePriceLevel),
  asks: Schema.Array(BinancePriceLevel)
})

/**
 * A depth snapshot returned by `GET /api/v3/depth`.
 */
export type DepthSnapshot = typeof DepthSnapshot.Type

/**
 * A diff-depth update pushed by the `<symbol>@depth` streams.
 *
 * `U`/`u` are the first/last update ids in the event; they drive the local-book
 * gap and staleness checks. `b`/`a` carry absolute quantities (zero removes the
 * level).
 */
export const DepthUpdateEvent = Schema.Struct({
  e: Schema.Literal("depthUpdate"),
  E: Schema.Int,
  s: Schema.String,
  U: Schema.Int,
  u: Schema.Int,
  b: Schema.Array(BinancePriceLevel),
  a: Schema.Array(BinancePriceLevel)
})

/**
 * A diff-depth update pushed by the `<symbol>@depth` streams.
 */
export type DepthUpdateEvent = typeof DepthUpdateEvent.Type

/**
 * A live control request sent over the raw `/ws` connection.
 */
export const ControlRequest = Schema.Struct({
  method: Schema.Literals(["SUBSCRIBE", "UNSUBSCRIBE"]),
  params: Schema.NonEmptyArray(Schema.String),
  id: Schema.Int
})

/**
 * A live control request sent over the raw `/ws` connection.
 */
export type ControlRequest = typeof ControlRequest.Type

/**
 * Normalize a bootstrap symbol to Binance pair form (`BTCUSDT`).
 *
 * Binance pairs are uppercase with no separator, while the symbol stored
 * elsewhere in the system may carry a separator (`BTC/USDT`, `BTC-USDT`) or be
 * lowercased. Strip every non-alphanumeric character and uppercase.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string =>
  symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()

/**
 * Stream name for a pair: `<symbol>@depth` in lowercase.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const streamNameFor = (symbol: string): string =>
  `${normalizeSymbol(symbol).toLowerCase()}${depthStreamSuffix}`
