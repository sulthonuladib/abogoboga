import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { BootstrapCoinsFromString, formatBootstrapCoins } from "./BootstrapCoin.ts"
import { decodeTickLine, encodeTickLine } from "./CanonicalTick.ts"
import { decodeCommandLine, encodeCommandLine } from "./WorkerCommand.ts"

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

  test("decodes a valid subscribe command", () => {
    const command = decodeCommandLine(`{"type":"subscribe","coins":[{"symbol":"SOL","coingeckoId":"solana"}]}`)

    expect(command).toEqual({ type: "subscribe", coins: [{ symbol: "SOL", coingeckoId: "solana" }] })
  })

  test("command line roundtrip", () => {
    const command = decodeCommandLine(`{"type":"unsubscribe","coins":[{"symbol":"ETH","coingeckoId":"ethereum"}]}`)

    expect(command).not.toBeNull()

    if (command !== null) {
      expect(decodeCommandLine(encodeCommandLine(command))).toEqual(command)
    }
  })

  test("rejects malformed command lines", () => {
    expect(decodeCommandLine("")).toBeNull()
    expect(decodeCommandLine("not json")).toBeNull()
    expect(decodeCommandLine(`{"type":"restart","coins":[{"symbol":"SOL","coingeckoId":"solana"}]}`)).toBeNull()
    expect(decodeCommandLine(`{"type":"subscribe","coins":[]}`)).toBeNull()
    expect(decodeCommandLine(`{"type":"subscribe","coins":[{"symbol":"","coingeckoId":"bitcoin"}]}`)).toBeNull()
    expect(decodeCommandLine(`{"type":"subscribe","coins":[{"symbol":"SOL","coingeckoId":1}]}`)).toBeNull()
    expect(decodeCommandLine(`{"type":"subscribe"}`)).toBeNull()
  })

  test("bootstrap string roundtrip", async () => {
    const coins = [
      { symbol: "BTC", coingeckoId: "bitcoin" },
      { symbol: "ETH", coingeckoId: "ethereum" }
    ] as const

    const encoded = await Effect.runPromise(Schema.encodeEffect(BootstrapCoinsFromString)([...coins]))

    expect(encoded).toBe("BTC:bitcoin,ETH:ethereum")
    expect(formatBootstrapCoins([...coins])).toBe("BTC:bitcoin,ETH:ethereum")

    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(BootstrapCoinsFromString)(encoded))

    expect(decoded).toEqual([...coins])
  })

  test("bootstrap empty string means no coins", async () => {
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(BootstrapCoinsFromString)(""))

    expect(decoded).toEqual([])
    expect(formatBootstrapCoins([])).toBe("")
  })

  test("bootstrap rejects invalid parts", async () => {
    const result = await Effect.runPromise(
      Effect.flip(Schema.decodeUnknownEffect(BootstrapCoinsFromString)("BTC:bitcoin,BROKEN"))
    )

    expect(String(result)).toContain("Invalid bootstrap coin")
  })
})
