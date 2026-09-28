import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { BootstrapContext } from "./BootstrapContext.ts"

describe("BootstrapContext", () => {
  test("roundtrips through JSON", async () => {
    const context = {
      exchangeSlug: "binance",
      shardId: "shard-2",
      coins: [
        { symbol: "BTC", coingeckoId: "bitcoin" },
        { symbol: "ETH", coingeckoId: "ethereum" }
      ]
    }

    const encoded = await Effect.runPromise(Schema.encodeEffect(Schema.toCodecJson(BootstrapContext))(context))

    const decoded = await Effect.runPromise(
      Schema.decodeEffect(Schema.toCodecJson(BootstrapContext))(encoded)
    )

    expect(decoded).toEqual(context)
  })

  test("rejects malformed bootstrap identities", async () => {
    const invalid = [
      { exchangeSlug: "binance", shardId: "shard-2" },
      { exchangeSlug: "", shardId: "shard-2", coins: [] },
      { exchangeSlug: "binance", shardId: "shard-2", coins: [{ symbol: "BTC" }] },
      { exchangeSlug: "binance", shardId: "", coins: [] }
    ]

    for (const input of invalid) {
      const result = await Effect.runPromise(
        Effect.flip(Schema.decodeUnknownEffect(Schema.toCodecJson(BootstrapContext))(input))
      )

      expect(String(result)).toBeTruthy()
    }
  })
})
