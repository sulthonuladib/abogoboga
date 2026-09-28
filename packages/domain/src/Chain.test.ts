import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Chain } from "./Chain.ts"

const row = {
  id: 1,
  name: "Ethereum",
  code: "ETH",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
} as const

describe("Chain", () => {
  test("database roundtrip", () => {
    const decoded = Schema.decodeSync(Chain)(row)

    const encoded = Schema.encodeSync(Chain)(decoded)

    expect(Schema.decodeSync(Chain)(encoded)).toEqual(decoded)
  })

  test("json roundtrip", () => {
    const decoded = Schema.decodeSync(Chain)(row)

    const json = Schema.encodeSync(Chain.json)(decoded)

    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(Schema.decodeSync(Chain.json)(json)).toEqual(decoded)
  })

  test("insert fills generated fields", async () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...insertInput } = row

    const inserted = await Effect.runPromise(Chain.insert.makeEffect(insertInput))

    expect("id" in inserted).toBe(false)
    expect(inserted.createdAt).toBeDefined()
    expect(inserted.code).toBe("ETH")
  })
})
