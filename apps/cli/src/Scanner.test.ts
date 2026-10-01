import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import Coingecko from "@coingecko/coingecko-typescript"
import { Effect, Layer } from "effect"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoinGecko, CoinGeckoError, type CoinListItem, type ExchangeTickerPage, coinImageBatchSize } from "./CoinGecko.ts"
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
      logo: "https://example.test/binance.png",
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
      logo: "https://example.test/indodax.png",
      baseCurrency: "idr",
      tickers: [{ base: "BTC", target: "IDR", coinId: "bitcoin", targetCoinId: "tether" }]
    }
  ],
  coins: [
    { id: "bitcoin", name: "Bitcoin", symbol: "btc", logo: "https://example.test/btc.png", platforms: {} },
    {
      id: "bitcoin",
      name: "Bitcoin (duplicate)",
      symbol: "btc",
      logo: "https://example.test/btc-dup.png",
      platforms: {}
    },
    {
      id: "tether",
      name: "Tether",
      symbol: "usdt",
      logo: "https://example.test/usdt.png",
      platforms: { ethereum: "0x0" }
    }
  ]
}

const options = { chainName: "Unmapped", chainCode: "UNMAPPED" }

describe("mapSnapshot", () => {
  test("maps the fallback chain from options and one exchange row per snapshot exchange", () => {
    const plan = mapSnapshot(snapshot, options)

    expect(plan.chain).toEqual({ name: "Unmapped", code: "UNMAPPED" })
    expect(plan.exchanges).toEqual([
      {
        slug: "binance",
        coingeckoId: "binance",
        name: "Binance",
        logo: "https://example.test/binance.png",
        baseCurrency: "usdt"
      },
      {
        slug: "indodax",
        coingeckoId: "indodax",
        name: "Indodax",
        logo: "https://example.test/indodax.png",
        baseCurrency: "idr"
      }
    ])
  })

  test("deduplicates coins by CoinGecko id and uses the id as the slug", () => {
    const plan = mapSnapshot(snapshot, options)

    expect(plan.coins).toEqual([
      {
        coingeckoId: "bitcoin",
        name: "Bitcoin",
        symbol: "btc",
        slug: "bitcoin",
        logo: "https://example.test/btc.png"
      },
      { coingeckoId: "tether", name: "Tether", symbol: "usdt", slug: "tether", logo: "https://example.test/usdt.png" }
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
        exchangeTickers: (_coingeckoId, pageNumber) => Effect.succeed(pages.get(pageNumber) ?? page([])),
        exchangeLogo: () => Effect.succeed("https://example.test/indodax.png"),
        coinImages: (ids) =>
          Effect.succeed(new Map(ids.map((id) => [id, `https://example.test/${id}.png`] as const)))
      })
    )

    const result = await Effect.runPromise(
      fetchSnapshot({ exchanges: ["indodax"], delayMillis: 0 }).pipe(Effect.provide(layer))
    )

    expect(result.exchanges).toHaveLength(1)
    expect(result.exchanges[0]?.logo).toBe("https://example.test/indodax.png")
    expect(result.exchanges[0]?.tickers).toHaveLength(204)
    expect(result.coins.map((coin) => coin.id)).toEqual(["coin-0", "coin-203"])
    expect(result.coins.every((coin) => coin.logo.startsWith("https://example.test/"))).toBe(true)
  })

  test("chunks coin logo lookups so each /coins/markets request stays within the id cap", async () => {
    const ticker = (index: number): ExchangeTickerPage["tickers"][number] => ({
      base: `T${index}`,
      target: "USDT",
      coinId: `coin-${index}`,
      targetCoinId: ""
    })

    const page = (tickers: ExchangeTickerPage["tickers"]): ExchangeTickerPage => ({
      name: "Binance",
      tickers,
      pageSize: tickers.length
    })

    const coinCount = coinImageBatchSize * 2 + 5

    const pages = new Map<number, ExchangeTickerPage>([
      [1, page(Array.from({ length: 100 }, (_, index) => ticker(index)))],
      [2, page(Array.from({ length: coinCount - 100 }, (_, index) => ticker(100 + index)))]
    ])

    const allCoins: ReadonlyArray<CoinListItem> = Array.from({ length: coinCount }, (_, index) => ({
      id: `coin-${index}`,
      name: `Coin ${index}`,
      symbol: `c${index}`,
      platforms: {}
    }))

    const batchSizes: Array<number> = []

    const layer = Layer.succeed(
      CoinGecko,
      CoinGecko.of({
        listCoins: Effect.succeed(allCoins),
        exchangeTickers: (_coingeckoId, pageNumber) => Effect.succeed(pages.get(pageNumber) ?? page([])),
        exchangeLogo: () => Effect.succeed("https://example.test/binance.png"),
        coinImages: (ids) => {
          batchSizes.push(ids.length)

          return Effect.succeed(new Map(ids.map((id) => [id, `https://example.test/${id}.png`] as const)))
        }
      })
    )

    const result = await Effect.runPromise(
      fetchSnapshot({ exchanges: ["binance"], delayMillis: 0 }).pipe(Effect.provide(layer))
    )

    expect(result.coins).toHaveLength(coinCount)
    expect(batchSizes).toEqual([coinImageBatchSize, coinImageBatchSize, 5])
    expect(batchSizes.every((size) => size <= coinImageBatchSize)).toBe(true)
  })

  test("splits a failed coin logo batch instead of failing the scan", async () => {
    const ticker = (index: number): ExchangeTickerPage["tickers"][number] => ({
      base: `T${index}`,
      target: "USDT",
      coinId: `coin-${index}`,
      targetCoinId: ""
    })

    const coinCount = 60

    const page: ExchangeTickerPage = {
      name: "Binance",
      tickers: Array.from({ length: coinCount }, (_, index) => ticker(index)),
      pageSize: coinCount
    }

    const allCoins: ReadonlyArray<CoinListItem> = Array.from({ length: coinCount }, (_, index) => ({
      id: `coin-${index}`,
      name: `Coin ${index}`,
      symbol: `c${index}`,
      platforms: {}
    }))

    const batchSizes: Array<number> = []
    let calls = 0

    const layer = Layer.succeed(
      CoinGecko,
      CoinGecko.of({
        listCoins: Effect.succeed(allCoins),
        exchangeTickers: () => Effect.succeed(page),
        exchangeLogo: () => Effect.succeed("https://example.test/binance.png"),
        coinImages: (ids) => {
          calls += 1
          batchSizes.push(ids.length)

          if (calls === 1) {
            return Effect.fail(
              new CoinGeckoError({
                operation: "coinImages",
                detail: "Request blocked.",
                status: 403,
                retryable: false,
                cause: new Error("Request blocked.")
              })
            )
          }

          return Effect.succeed(new Map(ids.map((id) => [id, `https://example.test/${id}.png`] as const)))
        }
      })
    )

    const result = await Effect.runPromise(
      fetchSnapshot({ exchanges: ["binance"], delayMillis: 0 }).pipe(Effect.provide(layer))
    )

    expect(result.coins).toHaveLength(coinCount)
    // The first 50-coin batch fails, splits into two 25-coin retries, and the
    // remaining 10-coin batch succeeds.
    expect(batchSizes).toEqual([50, 25, 25, 10])
    expect(result.coins.every((coin) => coin.logo.startsWith("https://example.test/"))).toBe(true)
  })

  test("splits a rate-limited coin logo batch after waiting the Retry-After window", async () => {
    const ticker = (index: number): ExchangeTickerPage["tickers"][number] => ({
      base: `T${index}`,
      target: "USDT",
      coinId: `coin-${index}`,
      targetCoinId: ""
    })

    const coinCount = 60

    const page: ExchangeTickerPage = {
      name: "Binance",
      tickers: Array.from({ length: coinCount }, (_, index) => ticker(index)),
      pageSize: coinCount
    }

    const allCoins: ReadonlyArray<CoinListItem> = Array.from({ length: coinCount }, (_, index) => ({
      id: `coin-${index}`,
      name: `Coin ${index}`,
      symbol: `c${index}`,
      platforms: {}
    }))

    const batchSizes: Array<number> = []

    const layer = Layer.succeed(
      CoinGecko,
      CoinGecko.of({
        listCoins: Effect.succeed(allCoins),
        exchangeTickers: () => Effect.succeed(page),
        exchangeLogo: () => Effect.succeed("https://example.test/binance.png"),
        coinImages: (ids) => {
          batchSizes.push(ids.length)

          if (ids.length > 30) {
            return Effect.fail(
              new CoinGeckoError({
                operation: "coinImages",
                detail: "rate limited",
                status: 429,
                retryable: true,
                // `Retry-After: 0` keeps the wait at zero so the test does not sleep.
                cause: new Coingecko.APIError(429, undefined, "rate limited", new Headers({ "retry-after": "0" }))
              })
            )
          }

          return Effect.succeed(new Map(ids.map((id) => [id, `https://example.test/${id}.png`] as const)))
        }
      })
    )

    const result = await Effect.runPromise(
      fetchSnapshot({ exchanges: ["binance"], delayMillis: 0 }).pipe(Effect.provide(layer))
    )

    expect(result.coins).toHaveLength(coinCount)
    expect(batchSizes).toEqual([50, 25, 25, 10])
    expect(result.coins.every((coin) => coin.logo.startsWith("https://example.test/"))).toBe(true)
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
