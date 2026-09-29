import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { BootstrapCoin } from "@lister/worker-contract"
import { OrderBookMessage, normalizeSymbol, orderBookTopicFor } from "./kucoin.ts"
import { tickFor } from "./orderbook.ts"

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

describe("KuCoin pair mapping", () => {
  test("maps a raw base symbol to the USDT pair", () => {
    expect(normalizeSymbol("sand")).toBe("SAND-USDT")
  })

  test("normalizes already quoted and separated symbols without duplicating the quote", () => {
    expect(normalizeSymbol("btc")).toBe("BTC-USDT")
    expect(normalizeSymbol("BTCUSDT")).toBe("BTC-USDT")
    expect(normalizeSymbol("BTC/USDT")).toBe("BTC-USDT")
    expect(normalizeSymbol("btc-usdt")).toBe("BTC-USDT")
  })

  test("builds the level-50 topic from the normalized pair", () => {
    expect(orderBookTopicFor(normalizeSymbol("btc"))).toBe("/spotMarket/level2Depth50:BTC-USDT")
  })
})

describe("KuCoin order-book decoding", () => {
  test("decodes a level-50 frame and emits a canonical tick", () => {
    const message = Schema.decodeSync(OrderBookMessage)({
      type: "message",
      topic: "/spotMarket/level2Depth50:BTC-USDT",
      subject: "level2",
      data: {
        asks: [["101.0", "2.0"], ["102.0", "3.0"]],
        bids: [["100.0", "1.0"], ["99.0", "4.0"]],
        timestamp: 1_700_000_000_000
      }
    })

    const tick = tickFor(message.data, btc, "kucoin", message.data.timestamp, 50)

    expect(tick).toEqual({
      exchangeSlug: "kucoin",
      symbol: "BTC",
      coingeckoId: "bitcoin",
      bids: [[100, 1], [99, 4]],
      asks: [[101, 2], [102, 3]],
      timestamp: 1_700_000_000_000
    })
  })
})
