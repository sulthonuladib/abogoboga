import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ServerEvent } from "./EventChannel.ts"
import { SignalEvent, SignalRow } from "./Signal.ts"

const row: SignalRow = {
  opportunityId: 1,
  symbol: "BTC",
  buyExchangeId: 2,
  buyExchangeSymbol: "BTC/IDR",
  buyPrice: 1_000_000,
  buyVolume: 2,
  buyTickTimestamp: 1_700_000_000_000,
  sellExchangeId: 3,
  sellExchangeSymbol: "BTC/USDT",
  sellPrice: 1_100_000,
  sellVolume: 3,
  sellTickTimestamp: 1_700_000_000_500,
  profitPercent: 10,
  profitVolume: 0.2
}

describe("Signal schemas", () => {
  test("a signal event round-trips through decode and encode", () => {
    const event = SignalEvent.make({ type: "signal", rows: [row] })

    const encoded = Schema.encodeSync(SignalEvent)(event)
    const decoded = Schema.decodeSync(SignalEvent)(encoded)

    expect(decoded).toEqual(event)
  })

  test("the server event union decodes a signal by its type tag", () => {
    const decoded = Schema.decodeSync(ServerEvent)({
      type: "signal",
      rows: [row]
    })

    expect(decoded.type).toBe("signal")

    if (decoded.type !== "signal") {
      throw new Error("expected a signal event")
    }

    expect(decoded.rows).toEqual([row])
  })
})
