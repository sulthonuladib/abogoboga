import { describe, expect, test } from "bun:test"
import { MexcWebSocketProto } from "@lister/generated"
import type { BootstrapCoin } from "@lister/worker-contract"
import { depthChannelFor, normalizeSymbol } from "./mexc.ts"
import { tickFromDepths } from "./orderbook.ts"

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

describe("MEXC pair mapping", () => {
  test("maps a raw base symbol to the USDT pair", () => {
    expect(normalizeSymbol("sand")).toBe("SANDUSDT")
  })

  test("normalizes already quoted and separated symbols without duplicating the quote", () => {
    expect(normalizeSymbol("btc")).toBe("BTCUSDT")
    expect(normalizeSymbol("BTCUSDT")).toBe("BTCUSDT")
    expect(normalizeSymbol("BTC/USDT")).toBe("BTCUSDT")
    expect(normalizeSymbol("btc-usdt")).toBe("BTCUSDT")
  })

  test("builds the limit-depth channel from the normalized pair", () => {
    expect(depthChannelFor(normalizeSymbol("btc"))).toBe("spot@public.limit.depth.v3.api.pb@BTCUSDT@20")
  })
})

describe("MEXC order-book decoding", () => {
  test("converts a limit-depth snapshot to a canonical tick", () => {
    const tick = tickFromDepths(
      {
        asks: [{ price: "101.0", quantity: "2.0" }, { price: "102.0", quantity: "3.0" }],
        bids: [{ price: "100.0", quantity: "1.0" }, { price: "99.0", quantity: "4.0" }]
      },
      btc,
      "mexc",
      1_700_000_000_000,
      20
    )

    expect(tick).toEqual({
      exchangeSlug: "mexc",
      symbol: "BTC",
      coingeckoId: "bitcoin",
      bids: [[100, 1], [99, 4]],
      asks: [[101, 2], [102, 3]],
      timestamp: 1_700_000_000_000
    })
  })

  test("decodes a protobuf limit-depth push with the generated wrapper", () => {
    const bytes = MexcWebSocketProto.PushDataV3ApiWrapper.encode({
      channel: depthChannelFor("BTCUSDT"),
      symbol: "BTCUSDT",
      sendTime: 1_700_000_000_000,
      publicLimitDepths: {
        asks: [{ price: "101.0", quantity: "2.0" }],
        bids: [{ price: "100.0", quantity: "1.0" }],
        eventType: "spot@public.limit.depth.v3.api.pb",
        version: "1",
        lastOrderCreateTime: 0
      }
    }).finish()

    const message = MexcWebSocketProto.PushDataV3ApiWrapper.decode(bytes)

    expect(message.symbol).toBe("BTCUSDT")
    expect(message.publicLimitDepths?.bids[0]).toEqual({ price: "100.0", quantity: "1.0" })
    expect(message.publicLimitDepths?.asks[0]).toEqual({ price: "101.0", quantity: "2.0" })
  })
})
