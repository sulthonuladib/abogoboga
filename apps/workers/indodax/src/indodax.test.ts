import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { BootstrapCoin } from "@lister/worker-contract"
import { OrderBookMessage, normalizeSymbol, orderBookChannelFor } from "./indodax.ts"
import { tickFor } from "./orderbook.ts"

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

describe("Indodax pair mapping", () => {
  test("maps a raw base symbol to the IDR pair", () => {
    expect(normalizeSymbol("sand")).toBe("sandidr")
  })

  test("normalizes already quoted and separated symbols without duplicating the quote", () => {
    expect(normalizeSymbol("btc")).toBe("btcidr")
    expect(normalizeSymbol("BTCIDR")).toBe("btcidr")
    expect(normalizeSymbol("BTC/IDR")).toBe("btcidr")
    expect(normalizeSymbol("btc-idr")).toBe("btcidr")
  })

  test("builds the order-book channel name from the normalized pair", () => {
    expect(orderBookChannelFor(normalizeSymbol("btc"))).toBe("market:order-book-btcidr")
  })
})

describe("Indodax order-book decoding", () => {
  test("decodes an order-book frame and emits a canonical tick", () => {
    const message = Schema.decodeSync(OrderBookMessage)({
      result: {
        channel: "market:order-book-btcidr",
        data: {
          data: {
            pair: "btcidr",
            ask: [
              { btc_volume: "0.11035661", idr_volume: "35251984", price: "319437000" },
              { btc_volume: "0.20000000", idr_volume: "63950800", price: "319754000" }
            ],
            bid: [
              { btc_volume: "0.61427265", idr_volume: "196220798", price: "319436000" },
              { btc_volume: "0.00697822", idr_volume: "2228655", price: "319373000" }
            ]
          },
          offset: 67409
        }
      }
    })

    const tick = tickFor(message.result.data.data, btc, "indodax", 1_700_000_000_000, 50)

    expect(tick).toEqual({
      exchangeSlug: "indodax",
      symbol: "BTC",
      coingeckoId: "bitcoin",
      bids: [[319436000, 0.61427265], [319373000, 0.00697822]],
      asks: [[319437000, 0.11035661], [319754000, 0.2]],
      timestamp: 1_700_000_000_000
    })
  })

  test("ignores non-order-book frames such as auth and subscription acknowledgements", () => {
    const authAck = Schema.decodeUnknownOption(OrderBookMessage)({
      id: 1,
      result: { client: "9690f773", version: "2.8.6", expires: true, ttl: 311392452 }
    })

    const subscribeAck = Schema.decodeUnknownOption(OrderBookMessage)({
      id: 2,
      result: { recoverable: true, epoch: "1630401092", offset: 814137 }
    })

    expect(authAck._tag).toBe("None")
    expect(subscribeAck._tag).toBe("None")
  })
})
