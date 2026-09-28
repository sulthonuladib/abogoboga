import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Market } from "./Market.ts"

const row = {
  id: 1,
  exchangeId: 2,
  cryptocurrencyId: 1,
  exchangeSymbol: "BTC/USDT",
  listed: true,
  tradeEnabled: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
} as const

describe("Market", () => {
  test("database roundtrip", () => {
    const decoded = Schema.decodeSync(Market)(row)

    const encoded = Schema.encodeSync(Market)(decoded)

    expect(Schema.decodeSync(Market)(encoded)).toEqual(decoded)
  })

  test("json roundtrip", () => {
    const decoded = Schema.decodeSync(Market)(row)

    const json = Schema.encodeSync(Market.json)(decoded)

    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(Schema.decodeSync(Market.json)(json)).toEqual(decoded)
  })

  test("insert fills generated fields", async () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...insertInput } =
      Schema.decodeSync(Market)(row)

    const inserted = await Effect.runPromise(Market.insert.makeEffect(insertInput))

    expect("id" in inserted).toBe(false)
    expect(inserted.createdAt).toBeDefined()
    expect(inserted.exchangeSymbol).toBe("BTC/USDT")
  })
})
