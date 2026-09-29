import { Schema } from "effect"

/**
 * KuCoin Classic spot market-data WebSocket wire types and endpoint constants.
 *
 * KuCoin does not expose a fixed public socket: the client first posts to
 * `bullet-public` for a short-lived token and an instance server, then connects
 * to `<endpoint>?token=<token>`. The level-50 order-book topic pushes a complete
 * 50-level snapshot on every change, so no REST snapshot or local book is
 * needed.
 *
 * @module
 */

/**
 * REST endpoint returning a public WebSocket token and the instance servers.
 */
export const bulletPublicUrl = "https://api.kucoin.com/api/v1/bullet-public"

/**
 * Order-book topic prefix; the full topic is
 * `/spotMarket/level2Depth50:<pair>`.
 */
export const orderBookTopicPrefix = "/spotMarket/level2Depth50:"

/**
 * Number of book levels carried by the level-50 topic.
 */
export const depthLevels = 50 as const

/**
 * Full order-book topic for a normalized pair (for example `BTC-USDT`).
 *
 * @param pair - Normalized KuCoin pair.
 */
export const orderBookTopicFor = (pair: string): string => `${orderBookTopicPrefix}${pair}`

/**
 * Quote currency every KuCoin spot book is denominated in.
 */
const quote = "USDT"

/**
 * Normalize a bootstrap symbol to KuCoin pair form (`BTC-USDT`).
 *
 * KuCoin pairs join the base and the `USDT` quote with a hyphen. The symbol
 * stored elsewhere may be the base only (`BTC`) or an already paired form with
 * no separator (`BTCUSDT`) or another separator (`BTC/USDT`). Strip
 * non-alphanumeric characters, drop any trailing quote, then re-append it with
 * KuCoin's hyphen separator.
 *
 * @param symbol - Trading symbol from a {@link BootstrapCoin}.
 */
export const normalizeSymbol = (symbol: string): string => {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const base = clean.endsWith(quote) ? clean.slice(0, -quote.length) : clean

  return `${base}-${quote}`
}

/**
 * One `instanceServers` entry from the bullet-public response.
 */
export const InstanceServer = Schema.Struct({
  endpoint: Schema.String,
  pingInterval: Schema.optional(Schema.Int),
  pingTimeout: Schema.optional(Schema.Int)
})

/**
 * One `instanceServers` entry from the bullet-public response.
 */
export type InstanceServer = typeof InstanceServer.Type

/**
 * Public token response from `POST /api/v1/bullet-public`.
 */
export const BulletPublicResponse = Schema.Struct({
  code: Schema.String,
  data: Schema.Struct({
    token: Schema.NonEmptyString,
    instanceServers: Schema.NonEmptyArray(InstanceServer)
  })
})

/**
 * Public token response from `POST /api/v1/bullet-public`.
 */
export type BulletPublicResponse = typeof BulletPublicResponse.Type

/**
 * One KuCoin price level `[price, size]`, decoded from strings.
 */
const KuCoinPriceLevel = Schema.Tuple([Schema.FiniteFromString, Schema.FiniteFromString])

/**
 * A complete level-50 snapshot pushed on an order-book topic.
 */
export const OrderBookMessage = Schema.Struct({
  type: Schema.Literal("message"),
  topic: Schema.NonEmptyString,
  subject: Schema.Literal("level2"),
  data: Schema.Struct({
    asks: Schema.Array(KuCoinPriceLevel),
    bids: Schema.Array(KuCoinPriceLevel),
    timestamp: Schema.Int
  })
})

/**
 * A complete level-50 snapshot pushed on an order-book topic.
 */
export type OrderBookMessage = typeof OrderBookMessage.Type

/**
 * Server keepalive. The client must answer with a `pong` carrying the same id.
 */
export const ServerPing = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Int]),
  type: Schema.Literal("ping")
})

/**
 * Server keepalive. The client must answer with a `pong` carrying the same id.
 */
export type ServerPing = typeof ServerPing.Type

/**
 * Either frame this worker understands on the wire.
 */
export const ServerMessage = Schema.Union([ServerPing, OrderBookMessage])

/**
 * Either frame this worker understands on the wire.
 */
export type ServerMessage = typeof ServerMessage.Type

/**
 * Live subscribe/unsubscribe request for one order-book topic.
 */
export const SubscribeRequest = Schema.Struct({
  id: Schema.Int,
  type: Schema.Literals(["subscribe", "unsubscribe"]),
  topic: Schema.NonEmptyString,
  response: Schema.Boolean
})

/**
 * Live subscribe/unsubscribe request for one order-book topic.
 */
export type SubscribeRequest = typeof SubscribeRequest.Type

/**
 * Client keepalive request.
 */
export const PingRequest = Schema.Struct({
  id: Schema.NonEmptyString,
  type: Schema.Literal("ping")
})

/**
 * Client keepalive request.
 */
export type PingRequest = typeof PingRequest.Type

/**
 * Answer to a server ping.
 */
export const PongRequest = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Int]),
  type: Schema.Literal("pong")
})

/**
 * Answer to a server ping.
 */
export type PongRequest = typeof PongRequest.Type

/**
 * Any message this worker writes to the KuCoin socket.
 */
export type ClientMessage = SubscribeRequest | PingRequest | PongRequest
