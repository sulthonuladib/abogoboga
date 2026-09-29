import { Schema } from "effect"

/**
 * MEXC spot market-data WebSocket wire types and endpoint constants.
 *
 * MEXC pushes partial-book depth as Protocol Buffers (decoded through
 * `@lister/generated`), interleaved with JSON control frames. The limit-depth
 * channel carries a complete limited-depth snapshot, so no REST snapshot or
 * local book is needed.
 *
 * @module
 */

/**
 * Spot market-data WebSocket endpoint. Connections are valid for at most 24
 * hours and support at most 30 subscriptions.
 */
export const wsUrl = "wss://wbs-api.mexc.com/ws"

/**
 * Number of book levels requested per pair. MEXC accepts 5, 10, or 20.
 */
export const depthLevels = 20 as const

/**
 * Partial-book depth channel prefix; the full channel is
 * `spot@public.limit.depth.v3.api.pb@<pair>@<level>`.
 */
export const depthChannelPrefix = "spot@public.limit.depth.v3.api.pb"

/**
 * Full limit-depth channel for a normalized pair (for example `BTCUSDT`).
 *
 * @param pair - Normalized MEXC pair.
 */
export const depthChannelFor = (pair: string): string =>
  `${depthChannelPrefix}@${pair}@${depthLevels}`

/**
 * Subscribe to one or more channels.
 */
export const subscribeMethod = "SUBSCRIPTION" as const

/**
 * Unsubscribe from one or more channels.
 */
export const unsubscribeMethod = "UNSUBSCRIPTION" as const

/**
 * Keepalive request; the server answers with `{"msg":"PONG"}`.
 */
export const pingMethod = "PING" as const

/**
 * Keepalive cadence, well under MEXC's one-minute idle disconnect.
 */
export const pingInterval = "20 seconds" as const

/**
 * Sampling cadence for the ticks stream. MEXC has no fixed 100ms feed, so the
 * worker samples the latest book once per second per the workers guidance.
 */
export const sampleInterval = "1 second" as const

/**
 * Quote currency every MEXC spot book is denominated in.
 */
const quote = "USDT"

/**
 * Normalize a bootstrap symbol to MEXC pair form (`BTCUSDT`).
 *
 * MEXC pairs are uppercase with no separator and use the `USDT` quote here. The
 * symbol stored elsewhere may be the base only (`BTC`) or an already paired
 * form with a separator (`BTC/USDT`, `BTC-USDT`). Strip non-alphanumeric
 * characters, drop any trailing quote, then re-append it.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string => {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const base = clean.endsWith(quote) ? clean.slice(0, -quote.length) : clean

  return `${base}${quote}`
}

/**
 * Live subscribe/unsubscribe request for one or more channels. MEXC control
 * frames are JSON even when the channel payload is protobuf.
 */
export const SubscriptionRequest = Schema.Struct({
  method: Schema.Literals([subscribeMethod, unsubscribeMethod]),
  params: Schema.NonEmptyArray(Schema.NonEmptyString)
})

/**
 * Live subscribe/unsubscribe request for one or more channels.
 */
export type SubscriptionRequest = typeof SubscriptionRequest.Type

/**
 * Keepalive request.
 */
export const PingRequest = Schema.Struct({
  method: Schema.Literal(pingMethod)
})

/**
 * Keepalive request.
 */
export type PingRequest = typeof PingRequest.Type

/**
 * Any JSON control message this worker writes to the MEXC socket.
 */
export type ClientMessage = SubscriptionRequest | PingRequest

/**
 * One price level from a decoded protobuf limit-depth snapshot.
 */
export interface DepthLevel {
  /** Level price as a decimal string. */
  readonly price: string
  /** Level quantity as a decimal string. */
  readonly quantity: string
}

/**
 * Bids and asks from a decoded protobuf limit-depth snapshot.
 */
export interface LimitDepths {
  /** Bid levels, best-first. */
  readonly bids: ReadonlyArray<DepthLevel>
  /** Ask levels, best-first. */
  readonly asks: ReadonlyArray<DepthLevel>
}
