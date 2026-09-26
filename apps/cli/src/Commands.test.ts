import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoinGecko } from "./CoinGecko.ts"
import { cli } from "./Commands.ts"
import type { Snapshot } from "./Scanner.ts"

const runCli = Command.runWith(cli, { version: "1.0.0" })

/**
 * Stub CoinGecko service so `scan import` (which never calls the network) can
 * satisfy the command tree's service requirements in tests.
 */
const coinGeckoStub = Layer.succeed(
  CoinGecko,
  CoinGecko.of({
    listCoins: Effect.die(new Error("CoinGecko is not used by scan import")),
    exchangeTickers: () => Effect.die(new Error("CoinGecko is not used by scan import")),
    exchangeLogo: () => Effect.die(new Error("CoinGecko is not used by scan import")),
    coinImages: () => Effect.die(new Error("CoinGecko is not used by scan import"))
  })
)

const testServices = Layer.mergeAll(Database.layerMemory(), BunServices.layer, coinGeckoStub)

const snapshot: Snapshot = {
  version: 1,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  exchanges: [
    {
      slug: "binance",
      coingeckoId: "binance",
      name: "Binance",
      logo: "https://example.test/binance.png",
      baseCurrency: "usdt",
      tickers: [
        { base: "BTC", target: "USDT", coinId: "bitcoin", targetCoinId: "tether" },
        { base: "ETH", target: "USDT", coinId: "ethereum", targetCoinId: "tether" }
      ]
    },
    {
      slug: "gateio",
      coingeckoId: "gate",
      name: "Gate.io",
      logo: "https://example.test/gate.png",
      baseCurrency: "usdt",
      tickers: [{ base: "BTC", target: "USDT", coinId: "bitcoin", targetCoinId: "tether" }]
    }
  ],
  coins: [
    { id: "bitcoin", name: "Bitcoin", symbol: "btc", logo: "https://example.test/btc.png", platforms: {} },
    {
      id: "ethereum",
      name: "Ethereum",
      symbol: "eth",
      logo: "https://example.test/eth.png",
      platforms: { ethereum: "0x0000000000000000000000000000000000000000" }
    }
  ]
}

const writeSnapshot = (name: string, value: Snapshot): string => {
  const directory = mkdtempSync(join(tmpdir(), "lister-scan-"))
  const file = join(directory, name)

  writeFileSync(file, JSON.stringify(value))

  return file
}

describe("lister cli", () => {
  test("scan import upserts snapshot rows idempotently through the Database service", async () => {
    const file = writeSnapshot("snapshot.json", snapshot)

    const program = Effect.gen(function*() {
      yield* runCli(["scan", "import", "--file", file])
      yield* runCli(["scan", "import", "--file", file])

      const { db } = yield* Database

      return {
        coins: yield* db.select().from(cryptocurrencyTable),
        exchanges: yield* db.select().from(exchangeTable),
        markets: yield* db.select().from(exchangeCryptocurrencyTable),
        chains: yield* db.select().from(chainTable),
        links: yield* db.select().from(exchangeCryptocurrencyChainTable)
      }
    })

    // SAFETY: `Command.runWith` infers `unknown` for E/R on Effect v4 RC
    // (`cli` unions handlers with distinct service needs). The provided
    // `Database.layerMemory()` + `BunServices.layer` satisfy the `scan import`
    // handler at runtime. Narrow to `never` requirements so `runPromise`
    // accepts the fully-provided program.
    const provided = program.pipe(
      Effect.provide(testServices),
      Effect.scoped
    ) as Effect.Effect<
      {
        readonly coins: ReadonlyArray<typeof cryptocurrencyTable.$inferSelect>
        readonly exchanges: ReadonlyArray<typeof exchangeTable.$inferSelect>
        readonly markets: ReadonlyArray<typeof exchangeCryptocurrencyTable.$inferSelect>
        readonly chains: ReadonlyArray<typeof chainTable.$inferSelect>
        readonly links: ReadonlyArray<typeof exchangeCryptocurrencyChainTable.$inferSelect>
      },
      unknown,
      never
    >

    const result = await Effect.runPromise(provided)

    expect(result.coins).toHaveLength(2)
    expect(result.exchanges).toHaveLength(2)
    expect(result.markets).toHaveLength(3)
    expect(result.chains).toHaveLength(1)
    expect(result.chains[0]?.code).toBe("UNMAPPED")
    expect(result.links).toHaveLength(3)
    expect(result.links.every((link) => link.exchangeChainCode === "UNMAPPED")).toBe(true)

    expect(result.exchanges.find((exchange) => exchange.slug === "gateio")?.coingeckoId).toBe("gate")
    expect(result.exchanges.find((exchange) => exchange.slug === "gateio")?.logo).toBe("https://example.test/gate.png")
    expect(result.coins.find((coin) => coin.slug === "bitcoin")?.coingeckoId).toBe("bitcoin")
    expect(result.coins.find((coin) => coin.slug === "bitcoin")?.logo).toBe("https://example.test/btc.png")
  })

  test("scan import honors fallback chain name and code overrides", async () => {
    const file = writeSnapshot("override.json", snapshot)

    const program = Effect.gen(function*() {
      yield* runCli(["scan", "import", "--file", file, "--unmapped-name", "Mystery", "--unmapped-code", "MYSTERY"])

      const { db } = yield* Database

      return {
        chains: yield* db.select().from(chainTable),
        links: yield* db.select().from(exchangeCryptocurrencyChainTable)
      }
    })

    // SAFETY: Same `Command.runWith` unknown-inference as above; `testServices`
    // satisfies all concrete requirements and runtime passes. Narrow to
    // `never` for `runPromise`.
    const provided = program.pipe(
      Effect.provide(testServices),
      Effect.scoped
    ) as Effect.Effect<
      {
        readonly chains: ReadonlyArray<typeof chainTable.$inferSelect>
        readonly links: ReadonlyArray<typeof exchangeCryptocurrencyChainTable.$inferSelect>
      },
      unknown,
      never
    >

    const result = await Effect.runPromise(provided)

    expect(result.chains[0]?.name).toBe("Mystery")
    expect(result.chains[0]?.code).toBe("MYSTERY")
    expect(result.links.every((link) => link.exchangeChainCode === "MYSTERY")).toBe(true)
  })

  test("migrate applies migrations against the provided database", async () => {
    // SAFETY: Same `Command.runWith` unknown-inference as above; layers satisfy
    // all concrete requirements and runtime passes. Narrow to `never` for
    // `runPromise`.
    const provided = runCli(["migrate"]).pipe(
      Effect.provide(testServices),
      Effect.scoped
    ) as Effect.Effect<void, unknown, never>

    await Effect.runPromise(provided)
  })
})
