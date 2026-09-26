import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { BootstrapCoin } from "@lister/worker-contract"
import { PartialDepthMessage, normalizeSymbol, partialDepthStreamFor } from "./binance.ts"
import { tickFromPartialBook } from "./partialBook.ts"

const btc: BootstrapCoin = { symbol: "btc", coingeckoId: "bitcoin" }

describe("Binance pair mapping", () => {
  test("maps a raw base symbol to the USDT pair", () => {
    expect(normalizeSymbol("sand")).toBe("SANDUSDT")
  })

  test("normalizes already quoted and separated symbols without duplicating the quote", () => {
    expect(normalizeSymbol("btc")).toBe("BTCUSDT")
    expect(normalizeSymbol("BTCUSDT")).toBe("BTCUSDT")
    expect(normalizeSymbol("BTC/USDT")).toBe("BTCUSDT")
    expect(normalizeSymbol("btc-usdt")).toBe("BTCUSDT")
  })

  test("builds the depth stream name from the normalized pair", () => {
    expect(partialDepthStreamFor("btc")).toBe("btcusdt@depth20@100ms")
  })

  test("decodes combined partial-depth frames and emits canonical ticks", () => {
    const message = Schema.decodeSync(PartialDepthMessage)({
      stream: partialDepthStreamFor(btc.symbol),
      data: {
        lastUpdateId: 123,
        bids: [["100.0", "2.0"], ["99.0", "3.0"]],
        asks: [["101.0", "4.0"], ["102.0", "5.0"]]
      }
    })

    const tick = tickFromPartialBook(btc, message.data, "binance", 1_700_000_000_000)

    expect(message.stream).toBe("btcusdt@depth20@100ms")
    expect(tick).toEqual({
      exchangeSlug: "binance",
      symbol: "btc",
      coingeckoId: "bitcoin",
      bids: [[100, 2], [99, 3]],
      asks: [[101, 4], [102, 5]],
      timestamp: 1_700_000_000_000
    })
  })
})
