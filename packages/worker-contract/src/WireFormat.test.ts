import { describe, expect, test } from "bun:test"
import { decodeTickLine, encodeTickLine } from "./CanonicalTick.ts"

const tickLine =
  `{"exchangeSlug":"binance","symbol":"BTC","coingeckoId":"bitcoin",` +
  `"bids":[[67000.5,0.1],[66999,0.2]],"asks":[[67001,0.15]],"timestamp":1726500000000}`

describe("worker wire format", () => {
  test("decodes a valid tick line", () => {
    const tick = decodeTickLine(tickLine)

    expect(tick).not.toBeNull()
    expect(tick?.exchangeSlug).toBe("binance")
    expect(tick?.symbol).toBe("BTC")
    expect(tick?.coingeckoId).toBe("bitcoin")
    expect(tick?.bids).toEqual([[67000.5, 0.1], [66999, 0.2]])
    expect(tick?.timestamp).toBe(1726500000000)
  })

  test("tick line roundtrip", () => {
    const tick = decodeTickLine(tickLine)

    expect(tick).not.toBeNull()

    if (tick !== null) {
      expect(decodeTickLine(encodeTickLine(tick))).toEqual(tick)
    }
  })

  test("rejects malformed tick lines", () => {
    expect(decodeTickLine("")).toBeNull()
    expect(decodeTickLine("   ")).toBeNull()
    expect(decodeTickLine("not json")).toBeNull()
    expect(decodeTickLine("[1,2,3]")).toBeNull()
    expect(decodeTickLine(`{"symbol":"BTC","coingeckoId":"bitcoin"}`)).toBeNull()
    expect(decodeTickLine(`{"exchangeSlug":"binance","symbol":"BTC","coingeckoId":1,"bids":[],"asks":[],"timestamp":1}`)).toBeNull()
    expect(decodeTickLine(`{"exchangeSlug":"binance","symbol":"BTC","coingeckoId":"","bids":[],"asks":[],"timestamp":1}`)).toBeNull()
    expect(decodeTickLine(`{"exchangeSlug":"binance","symbol":"BTC","coingeckoId":"bitcoin","bids":[[1]],"asks":[],"timestamp":1}`)).toBeNull()
    expect(decodeTickLine(`{"exchangeSlug":"binance","symbol":"BTC","coingeckoId":"bitcoin","bids":[],"asks":[],"timestamp":1.5}`)).toBeNull()
  })
})
