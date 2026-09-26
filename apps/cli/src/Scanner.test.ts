import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoinGecko, type CoinListItem, type ExchangeTickerPage } from "./CoinGecko.ts"
import {
  fetchSnapshot,
  mapSnapshot,
  readSnapshot,
  writeSnapshot,
  type Snapshot
} from "./Scanner.ts"

const snapshot: Snapshot = {
  version: 1,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  exchanges: [
    {
      slug: "binance",
      coingeckoId: "binance",
      name: "Binance",
      baseCurrency: "usdt",
      tickers: [
        { base: "BTC", target: "USDT", coinId: "bitcoin", targetCoinId: "tether" },
        { base: "WBTC", target: "USDT", coinId: "wrapped-bitcoin", targetCoinId: "tether" }
      ]
    },
    {
      slug: "indodax",
      coingeckoId: "indodax",
      name: "Indodax",
      baseCurrency: "idr",
      tickers: [{ base: "BTC", target: "IDR", coinId: "bitcoin", targetCoinId: "tether" }]
    }
  ],
  coins: [
    { id: "bitcoin", name: "Bitcoin", symbol: "btc", platforms: {} },
    { id: "bitcoin", name: "Bitcoin (duplicate)", symbol: "btc", platforms: {} },
    { id: "tether", name: "Tether", symbol: "usdt", platforms: { ethereum: "0x0" } }
  ]
}

const options = { chainName: "Unmapped", chainCode: "UNMAPPED" }

describe("mapSnapshot", () => {
  test("maps the fallback chain from options and one exchange row per snapshot exchange", () => {
    const plan = mapSnapshot(snapshot, options)

    expect(plan.chain).toEqual({ name: "Unmapped", code: "UNMAPPED" })
    expect(plan.exchanges).toEqual([
      { slug: "binance", coingeckoId: "binance", name: "Binance", logo: "", baseCurrency: "usdt" },
      { slug: "indodax", coingeckoId: "indodax", name: "Indodax", logo: "", baseCurrency: "idr" }
    ])
  })

  test("deduplicates coins by CoinGecko id and uses the id as the slug", () => {
    const plan = mapSnapshot(snapshot, options)

    expect(plan.coins).toEqual([
      { coingeckoId: "bitcoin", name: "Bitcoin", symbol: "btc", slug: "bitcoin", logo: "" },
      { coingeckoId: "tether", name: "Tether", symbol: "usdt", slug: "tether", logo: "" }
    ])
  })

  test("emits one market per exchange ticker with the exchange base symbol", () => {
    const plan = mapSnapshot(snapshot, options)

    expect(plan.markets).toEqual([
      { exchangeSlug: "binance", coingeckoId: "bitcoin", exchangeSymbol: "BTC" },
      { exchangeSlug: "binance", coingeckoId: "wrapped-bitcoin", exchangeSymbol: "WBTC" },
      { exchangeSlug: "indodax", coingeckoId: "bitcoin", exchangeSymbol: "BTC" }
    ])
  })
})

describe("fetchSnapshot", () => {
  test("pages tickers, deduplicates by coin id, and keeps only referenced coins", async () => {
    const ticker = (index: number): ExchangeTickerPage["tickers"][number] => ({
      base: `T${index}`,
      target: "IDR",
      coinId: `coin-${index}`,
      targetCoinId: ""
    })

    const page = (tickers: ExchangeTickerPage["tickers"]): ExchangeTickerPage => ({
      name: "Indodax",
      tickers,
      pageSize: tickers.length
    })

    const pages = new Map<number, ExchangeTickerPage>([
      [1, page(Array.from({ length: 100 }, (_, index) => ticker(index)))],
      [2, page([ticker(0), ...Array.from({ length: 99 }, (_, index) => ticker(100 + index))])],
      [3, page(Array.from({ length: 5 }, (_, index) => ticker(199 + index)))]
    ])

    const allCoins: ReadonlyArray<CoinListItem> = [
      { id: "coin-0", name: "Coin 0", symbol: "c0", platforms: {} },
      { id: "coin-203", name: "Coin 203", symbol: "c203", platforms: { ethereum: "0x0" } },
      { id: "unused", name: "Unused", symbol: "un", platforms: {} }
    ]

    const layer = Layer.succeed(
      CoinGecko,
      CoinGecko.of({
        listCoins: Effect.succeed(allCoins),
        exchangeTickers: (_coingeckoId, pageNumber) => Effect.succeed(pages.get(pageNumber) ?? page([]))
      })
    )

    const result = await Effect.runPromise(
      fetchSnapshot({ exchanges: ["indodax"], delayMillis: 0 }).pipe(Effect.provide(layer))
    )

    expect(result.exchanges).toHaveLength(1)
    expect(result.exchanges[0]?.tickers).toHaveLength(204)
    expect(result.coins.map((coin) => coin.id)).toEqual(["coin-0", "coin-203"])
  })
})

describe("snapshot files", () => {
  test("roundtrip through the filesystem", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "lister-snapshot-")), "snapshot.json")

    const program = Effect.gen(function*() {
      yield* writeSnapshot(path, snapshot)

      return yield* readSnapshot(path)
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(BunServices.layer)))

    expect(result).toEqual(snapshot)
  })
})
