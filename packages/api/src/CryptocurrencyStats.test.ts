import { describe, expect, test } from "bun:test"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import {
  ChainId,
  ChainLink,
  Cryptocurrency as CryptocurrencyModel,
  CryptocurrencyId,
  ExchangeId,
  Market
} from "@lister/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { Cryptocurrency, type CryptocurrencyStat } from "./Cryptocurrency.ts"
import { layer as CryptocurrencyStoreLive } from "./CryptocurrencyStore.ts"
import { decodeCursor, keysetWindow, pageWindow } from "./Pagination.ts"
import { decodeRows } from "./RowDecoding.ts"
import { buildListingStatsOracle, type ListingStatsOracleQuery } from "./testing/listing-stats-oracle.ts"

const DatabaseTestLayer = Database.layerMemory()

const TestLayer = Cryptocurrency.layer.pipe(
  Layer.provide(CryptocurrencyStoreLive),
  Layer.provideMerge(DatabaseTestLayer)
)

const exchangeId = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

const cryptoId = (value: number): CryptocurrencyId => Schema.decodeSync(CryptocurrencyId)(value)

const chainId = (value: number): ChainId => Schema.decodeSync(ChainId)(value)

const run = <A, E>(effect: Effect.Effect<A, E, Cryptocurrency | Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped))

/**
 * Read the first returned row of an insert, failing the test when the database
 * returned nothing.
 */
const first = <T>(rows: ReadonlyArray<T>): T => {
  const [row] = rows

  if (row === undefined) throw new Error("expected an inserted row")

  return row
}

/**
 * Decode a response cursor, failing the test when none was returned.
 */
const cursorOf = (nextCursor: string | null | undefined) => {
  if (nextCursor === null || nextCursor === undefined) {
    throw new Error("expected the response to carry a cursor")
  }

  return Option.getOrThrowWith(decodeCursor(nextCursor), () => new Error("nextCursor did not decode"))
}

/** Stable projection of a stats row for structural comparison. */
type StatsRowProjection = {
  readonly id: number
  readonly symbol: string
  readonly markets: number
  readonly chains: number
  readonly blocked: number
}

/**
 * Project a stats row down to the fields characterization compares.
 *
 * @param row - Decoded stats row.
 * @returns The comparable projection.
 */
const statsRow = (row: CryptocurrencyStat): StatsRowProjection => ({
  id: row.id,
  symbol: row.symbol,
  markets: row.markets,
  chains: row.chains,
  blocked: row.blocked
})

/**
 * Seed two exchanges, two chains, and four coins with deliberately varied
 * coverage:
 *
 * - BTC: two markets, two chains, every pair connected.
 * - LTC: one market, one chain (matches the `single` flag).
 * - DOGE: two markets, no links (every pair blocked).
 * - XRP: two markets, one chain, a one-way route (connected, not blocked).
 */
const seed = Effect.gen(function*() {
  const { db } = yield* Database

  const binance = first(yield* db.insert(exchangeTable).values({
    coingeckoId: "binance",
    name: "Binance",
    slug: "binance",
    logo: "",
    baseCurrency: "usdt"
  }).returning())

  const indodax = first(yield* db.insert(exchangeTable).values({
    coingeckoId: "indodax",
    name: "Indodax",
    slug: "indodax",
    logo: "",
    baseCurrency: "idr"
  }).returning())

  const ethereum = first(yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning())
  const tron = first(yield* db.insert(chainTable).values({ name: "Tron", code: "TRON" }).returning())

  const coin = (input: {
    readonly name: string
    readonly symbol: string
    readonly slug: string
    readonly coingeckoId: string
  }) => db.insert(cryptocurrencyTable).values({ ...input, logo: "" }).returning()

  const bitcoin = first(yield* coin({ name: "Bitcoin", symbol: "BTC", slug: "bitcoin", coingeckoId: "bitcoin" }))
  const litecoin = first(yield* coin({ name: "Litecoin", symbol: "LTC", slug: "litecoin", coingeckoId: "litecoin" }))
  const dogecoin = first(yield* coin({ name: "Dogecoin", symbol: "DOGE", slug: "dogecoin", coingeckoId: "dogecoin" }))
  const ripple = first(yield* coin({ name: "Ripple", symbol: "XRP", slug: "ripple", coingeckoId: "ripple" }))

  const market = (exchange: number, cryptocurrency: number, exchangeSymbol: string) =>
    db
      .insert(exchangeCryptocurrencyTable)
      .values({
        exchangeId: exchangeId(exchange),
        cryptocurrencyId: cryptoId(cryptocurrency),
        exchangeSymbol
      })
      .returning()

  const btcBinance = first(yield* market(binance.id, bitcoin.id, "BTCUSDT"))

  const btcIndodax = first(yield* market(indodax.id, bitcoin.id, "BTCIDR"))

  const ltcBinance = first(yield* market(binance.id, litecoin.id, "LTCUSDT"))

  // DOGE's markets deliberately carry no links, so only their existence matters.
  yield* market(binance.id, dogecoin.id, "DOGEUSDT")
  yield* market(indodax.id, dogecoin.id, "DOGEIDR")

  const xrpBinance = first(yield* market(binance.id, ripple.id, "XRPUSDT"))

  const xrpIndodax = first(yield* market(indodax.id, ripple.id, "XRPIDR"))

  const link = (
    exchangeCryptocurrency: number,
    chain: number,
    exchangeChainCode: string,
    withdrawEnabled: boolean,
    depositEnabled: boolean
  ) =>
    db.insert(exchangeCryptocurrencyChainTable).values({
      exchangeCryptocurrencyId: exchangeCryptocurrency,
      chainId: chain,
      exchangeChainCode,
      withdrawEnabled,
      depositEnabled
    }).returning()

  yield* link(btcBinance.id, ethereum.id, "ERC20", true, true)
  yield* link(btcBinance.id, tron.id, "TRC20", true, true)
  yield* link(btcIndodax.id, ethereum.id, "ERC20", true, true)
  yield* link(ltcBinance.id, ethereum.id, "ERC20", true, true)
  yield* link(xrpBinance.id, tron.id, "TRC20", true, false)
  yield* link(xrpIndodax.id, tron.id, "TRC20", false, true)

  return { binance, indodax, ethereum, tron }
})

/**
 * Load the raw rows the oracle works from, applying the legacy search
 * semantics (trimmed, case-insensitive symbol/name substring) in memory.
 */
const loadSources = (search: string) =>
  Effect.gen(function*() {
    const { db } = yield* Database

    const coins = decodeRows(CryptocurrencyModel)(yield* db.select().from(cryptocurrencyTable))
    const markets = decodeRows(Market)(yield* db.select().from(exchangeCryptocurrencyTable))
    const links = decodeRows(ChainLink)(yield* db.select().from(exchangeCryptocurrencyChainTable))

    const term = search.trim().toLowerCase()

    const matched = term === ""
      ? coins
      : coins.filter((row) =>
        row.symbol.toLowerCase().includes(term) || row.name.toLowerCase().includes(term)
      )

    return { coins: matched, markets, links }
  })

describe("coin listing stats characterization", () => {
  test("page-mode stats match the in-memory oracle for every case", async () => {
    const comparisons = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency
        const fixture = yield* seed

        const cases: ReadonlyArray<{ readonly name: string; readonly query: ListingStatsOracleQuery }> = [
          {
            name: "all coins by symbol asc",
            query: { page: 1, limit: 10, search: "", flag: "all", sortBy: "symbol", order: "asc" }
          },
          {
            name: "markets desc applies to the full filtered set",
            query: { page: 1, limit: 2, search: "", flag: "all", sortBy: "markets", order: "desc" }
          },
          {
            name: "chains asc",
            query: { page: 1, limit: 10, search: "", flag: "all", sortBy: "chains", order: "asc" }
          },
          {
            name: "blocked desc",
            query: { page: 1, limit: 10, search: "", flag: "all", sortBy: "blocked", order: "desc" }
          },
          {
            name: "symbol desc",
            query: { page: 1, limit: 10, search: "", flag: "all", sortBy: "symbol", order: "desc" }
          },
          {
            name: "second offset page",
            query: { page: 2, limit: 2, search: "", flag: "all", sortBy: "symbol", order: "asc" }
          },
          {
            name: "single flag",
            query: { page: 1, limit: 10, search: "", flag: "single", sortBy: "symbol", order: "asc" }
          },
          {
            name: "blocked flag",
            query: { page: 1, limit: 10, search: "", flag: "blocked", sortBy: "symbol", order: "asc" }
          },
          {
            name: "exchange filter excludes other listings",
            query: {
              page: 1,
              limit: 10,
              search: "",
              flag: "all",
              sortBy: "symbol",
              order: "asc",
              exchangeId: exchangeId(fixture.indodax.id)
            }
          },
          {
            name: "chain filter",
            query: {
              page: 1,
              limit: 10,
              search: "",
              flag: "all",
              sortBy: "symbol",
              order: "asc",
              chainId: chainId(fixture.tron.id)
            }
          },
          {
            name: "exchange filter with flag",
            query: {
              page: 1,
              limit: 10,
              search: "",
              flag: "blocked",
              sortBy: "symbol",
              order: "asc",
              exchangeId: exchangeId(fixture.binance.id)
            }
          },
          {
            name: "search by name",
            query: { page: 1, limit: 10, search: "lite", flag: "all", sortBy: "symbol", order: "asc" }
          },
          {
            name: "unlimited window",
            query: { page: 1, limit: -1, search: "", flag: "all", sortBy: "markets", order: "desc" }
          }
        ]

        const expected = []

        for (const testCase of cases) {
          const sources = yield* loadSources(testCase.query.search)
          const oracle = buildListingStatsOracle(sources, testCase.query)

          const actual = yield* service.stats({
            window: pageWindow(testCase.query.page),
            limit: testCase.query.limit,
            search: testCase.query.search,
            flag: testCase.query.flag,
            sortBy: testCase.query.sortBy,
            order: testCase.query.order,
            exchangeId: testCase.query.exchangeId,
            chainId: testCase.query.chainId
          })

          expected.push({ name: testCase.name, oracle, actual })
        }

        return expected
      })
    )

    for (const comparison of comparisons) {
      expect(comparison.actual.data.map(statsRow), comparison.name).toEqual(comparison.oracle.data.map(statsRow))
      expect(comparison.actual.meta, `${comparison.name} meta`).toEqual(comparison.oracle.meta)
    }
  })

  test("reports the fixture's expected coverage counts", async () => {
    const result = await run(
      Effect.gen(function*() {
        yield* seed

        const service = yield* Cryptocurrency

        const all = yield* service.stats({
          window: pageWindow(1),
          limit: 10,
          search: "",
          flag: "all",
          sortBy: "symbol",
          order: "asc"
        })

        const single = yield* service.stats({
          window: pageWindow(1),
          limit: 10,
          search: "",
          flag: "single",
          sortBy: "symbol",
          order: "asc"
        })

        const blocked = yield* service.stats({
          window: pageWindow(1),
          limit: 10,
          search: "",
          flag: "blocked",
          sortBy: "blocked",
          order: "desc"
        })

        return { all, single, blocked }
      })
    )

    expect(result.all.data.map(statsRow)).toEqual([
      { id: 1, symbol: "BTC", markets: 2, chains: 2, blocked: 0 },
      { id: 3, symbol: "DOGE", markets: 2, chains: 0, blocked: 2 },
      { id: 2, symbol: "LTC", markets: 1, chains: 1, blocked: 0 },
      { id: 4, symbol: "XRP", markets: 2, chains: 1, blocked: 0 }
    ])
    expect(result.single.data.map((row) => row.symbol)).toEqual(["LTC"])
    expect(result.blocked.data.map(statsRow)).toEqual([
      { id: 3, symbol: "DOGE", markets: 2, chains: 0, blocked: 2 }
    ])
    expect(result.all.meta).toMatchObject({ items: 4, pages: 1, page: 1, from: 1, to: 4 })
  })

  test("keyset paging reproduces the full filtered order without repeats", async () => {
    const result = await run(
      Effect.gen(function*() {
        yield* seed

        const service = yield* Cryptocurrency
        const sort = { limit: 1, search: "", flag: "all", sortBy: "markets", order: "desc" } as const

        const firstPage = yield* service.stats({ window: keysetWindow(), ...sort })
        const secondPage = yield* service.stats({ window: keysetWindow(cursorOf(firstPage.nextCursor)), ...sort })
        const thirdPage = yield* service.stats({ window: keysetWindow(cursorOf(secondPage.nextCursor)), ...sort })
        const fourthPage = yield* service.stats({ window: keysetWindow(cursorOf(thirdPage.nextCursor)), ...sort })
        const full = yield* service.stats({ ...sort, window: pageWindow(1), limit: -1 })

        return { firstPage, secondPage, thirdPage, fourthPage, full }
      })
    )

    // Counts tie on `markets`, so this also exercises the symbol/id tiebreak
    // the cursor predicate must mirror exactly.
    expect(result.firstPage.data.map((row) => row.symbol)).toEqual(["BTC"])
    expect(result.secondPage.data.map((row) => row.symbol)).toEqual(["DOGE"])
    expect(result.thirdPage.data.map((row) => row.symbol)).toEqual(["XRP"])
    expect(result.fourthPage.data.map((row) => row.symbol)).toEqual(["LTC"])

    const paged = [
      ...result.firstPage.data,
      ...result.secondPage.data,
      ...result.thirdPage.data,
      ...result.fourthPage.data
    ]

    expect(paged.map((row) => row.symbol)).toEqual(result.full.data.map((row) => row.symbol))
    expect(new Set(paged.map((row) => row.id)).size).toBe(4)
    expect(result.firstPage.meta.hasNextPage).toBe(true)
    expect(result.fourthPage.nextCursor).toBeNull()
    expect(result.fourthPage.meta.hasNextPage).toBe(false)
  })
})
