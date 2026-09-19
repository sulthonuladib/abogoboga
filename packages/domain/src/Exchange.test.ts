import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { Exchange } from "./Exchange.ts"

const row = {
  id: 1,
  cmcId: 1027,
  name: "Binance",
  slug: "binance",
  logo: "https://example.com/binance.png",
  registeredOnCmc: true,
  baseCurrency: "usdt",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
} as const

describe("Exchange", () => {
  test("database roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(Exchange)(row)

    const encoded = Schema.encodeSync(Exchange)(decoded)

    expect(Schema.decodeUnknownSync(Exchange)(encoded)).toEqual(decoded)
  })

  test("json roundtrip", () => {
    const decoded = Schema.decodeUnknownSync(Exchange)(row)

    const json = Schema.encodeSync(Exchange.json)(decoded)

    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(json.updatedAt).toBe("2026-01-02T00:00:00.000Z")
    expect(Schema.decodeUnknownSync(Exchange.json)(json)).toEqual(decoded)
  })

  test("insert fills generated fields", async () => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...insertInput } = row

    const inserted = await Effect.runPromise(Exchange.insert.makeEffect(insertInput))

    expect("id" in inserted).toBe(false)
    expect(inserted.createdAt).toBeDefined()
    expect(inserted.updatedAt).toBeDefined()
    expect(inserted.slug).toBe("binance")
  })
})
