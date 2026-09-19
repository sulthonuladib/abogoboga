import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { ChainLink } from "./ChainLink.ts"

const row = {
  id: 1,
  exchangeChainCode: "ETH",
  exchangeCryptocurrencyId: 7,
  chainId: 1,
  exchangeChainName: null,
  withdrawEnabled: true,
  depositEnabled: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
} as const

describe("ChainLink", () => {
  test("database roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(ChainLink)(row)

    const encoded = Schema.encodeSync(ChainLink)(decoded)

    expect(Schema.decodeUnknownSync(ChainLink)(encoded)).toEqual(decoded)
  })

  test("json roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(ChainLink)(row)

    const json = Schema.encodeSync(ChainLink.json)(decoded)

    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(Schema.decodeUnknownSync(ChainLink.json)(json)).toEqual(decoded)
  })

  test("insert fills generated fields", async () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...insertInput } =
      Schema.decodeUnknownSync(ChainLink)(row)

    const inserted = await Effect.runPromise(ChainLink.insert.makeEffect(insertInput))

    expect("id" in inserted).toBe(false)
    expect(inserted.createdAt).toBeDefined()
    expect(inserted.exchangeChainCode).toBe("ETH")
  })
})
