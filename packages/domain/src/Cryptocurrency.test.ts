import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Cryptocurrency } from "./Cryptocurrency.ts"

const row = {
  id: 1,
  name: "Bitcoin",
  symbol: "BTC",
  slug: "bitcoin",
  logo: "https://example.com/btc.png",
  coingeckoId: "bitcoin",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
} as const

describe("Cryptocurrency", () => {
  test("database roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(Cryptocurrency)(row)

    const encoded = Schema.encodeSync(Cryptocurrency)(decoded)

    expect(Schema.decodeUnknownSync(Cryptocurrency)(encoded)).toEqual(decoded)
  })

  test("json roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(Cryptocurrency)(row)

    const json = Schema.encodeSync(Cryptocurrency.json)(decoded)

    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(Schema.decodeUnknownSync(Cryptocurrency.json)(json)).toEqual(decoded)
  })

  test("insert fills generated fields", async () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...insertInput } = row

    const inserted = await Effect.runPromise(Cryptocurrency.insert.makeEffect(insertInput))

    expect("id" in inserted).toBe(false)
    expect(inserted.createdAt).toBeDefined()
    expect(inserted.symbol).toBe("BTC")
  })
})
