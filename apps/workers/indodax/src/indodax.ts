import { Schema } from "effect"

/**
 * Indodax market-data WebSocket wire types and endpoint constants.
 *
 * These mirror the Indodax market-data WebSocket documentation. Indodax names
 * each order-book level's base volume after its base coin (`btc_volume` on
 * `btcidr`), so levels are decoded as string maps and the base quantity is read
 * from the key matching the pair.
 *
 * @module
 */

/**
 * Production market-data WebSocket endpoint. A single connection carries
 * authentication, channel subscriptions, and keepalive pings.
 */
export const wsUrl = "wss://ws3.indodax.com/ws/"

/**
 * Static public market-data token from the Indodax documentation. It is sent
 * once per connection before subscribing to any channel.
 */
export const staticToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE5NDY2MTg0MTV9.UR1lBM6Eqh0yWz-PVirw1uPCxe60FdchR8eNVdsskeo"

/**
 * Subscribe to a channel (`method: 1`). The response acknowledges the
 * subscription with `{ id, result: { recoverable, epoch, offset } }`.
 */
export const subscribeMethod = 1

/**
 * Unsubscribe from a channel (`method: 2`). The response acknowledges the
 * removal with `{ id, result: {} }`.
 */
export const unsubscribeMethod = 2

/**
 * Ping the server (`method: 7`). The response echoes the request id; the ping
 * keeps an otherwise idle connection alive.
 */
export const pingMethod = 7

/**
 * Order-book channel prefix; the full channel is `market:order-book-<pair>`.
 */
export const orderBookChannelPrefix = "market:order-book-"

/**
 * Full order-book channel name for an Indodax pair (for example
 * `market:order-book-btcidr`).
 *
 * @param pair - Normalized Indodax pair such as `btcidr`.
 */
export const orderBookChannelFor = (pair: string): string => `${orderBookChannelPrefix}${pair}`

/**
 * Sampling cadence for the ticks stream. Indodax's order-book channel pushes
 * full snapshots on change rather than at a fixed 100ms, so the worker samples
 * the latest book once per second per the workers guidance.
 */
export const sampleInterval = "1 second" as const

/**
 * Keepalive ping cadence, matching the historical Indodax worker.
 */
export const pingInterval = "1 minute" as const

/**
 * One order-book level, keyed by field name. Indodax sends `price`,
 * `idr_volume`, and a base-coin volume such as `btc_volume`.
 */
export const OrderBookLevel = Schema.Record(Schema.String, Schema.String)

/**
 * One order-book level, keyed by field name.
 */
export type OrderBookLevel = typeof OrderBookLevel.Type

/**
 * A complete order-book snapshot pushed by `market:order-book-<pair>`.
 */
export const OrderBook = Schema.Struct({
  pair: Schema.String,
  ask: Schema.Array(OrderBookLevel),
  bid: Schema.Array(OrderBookLevel)
})

/**
 * A complete order-book snapshot pushed by `market:order-book-<pair>`.
 */
export type OrderBook = typeof OrderBook.Type

/**
 * One order-book channel message. The double `data` nesting is Indodax's
 * channel envelope; `offset` is a server recovery cursor that this worker does
 * not use.
 */
export const OrderBookMessage = Schema.Struct({
  result: Schema.Struct({
    channel: Schema.String,
    data: Schema.Struct({
      data: OrderBook,
      offset: Schema.optional(Schema.Int)
    })
  })
})

/**
 * One order-book channel message.
 */
export type OrderBookMessage = typeof OrderBookMessage.Type

/**
 * Authentication request sent immediately after connecting.
 */
export const AuthRequest = Schema.Struct({
  params: Schema.Struct({ token: Schema.NonEmptyString }),
  id: Schema.Int
})

/**
 * Authentication request sent immediately after connecting.
 */
export type AuthRequest = typeof AuthRequest.Type

/**
 * Live subscribe/unsubscribe request for one channel.
 */
export const ChannelRequest = Schema.Struct({
  method: Schema.Int,
  params: Schema.Struct({ channel: Schema.NonEmptyString }),
  id: Schema.Int
})

/**
 * Live subscribe/unsubscribe request for one channel.
 */
export type ChannelRequest = typeof ChannelRequest.Type

/**
 * Keepalive ping request.
 */
export const PingRequest = Schema.Struct({
  method: Schema.Int,
  id: Schema.Int
})

/**
 * Keepalive ping request.
 */
export type PingRequest = typeof PingRequest.Type

/**
 * Any message this worker writes to the Indodax socket.
 */
export type ClientMessage = AuthRequest | ChannelRequest | PingRequest

/**
 * Quote currency every Indodax spot book is denominated in.
 */
const quote = "IDR"

/**
 * Normalize a bootstrap symbol to Indodax pair form (`btcidr`).
 *
 * Indodax pairs are the base coin followed by the `IDR` quote, lowercased and
 * with no separator. The symbol stored elsewhere in the system may be the base
 * only (`BTC`) or an already paired form with a separator (`BTC/IDR`,
 * `BTC-IDR`). Strip non-alphanumeric characters, drop any trailing quote, then
 * re-append it lowercase.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string => {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const base = clean.endsWith(quote) ? clean.slice(0, -quote.length) : clean

  return `${base}${quote}`.toLowerCase()
}
