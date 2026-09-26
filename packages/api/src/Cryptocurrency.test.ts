import { describe, expect, test } from "bun:test"
import { Database, chainTable, exchangeTable } from "@lister/db"
import { exchangeCryptocurrencyChainTable, exchangeCryptocurrencyTable } from "@lister/db"
import { ChainId, CryptocurrencyId, ExchangeId } from "@lister/domain"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { Cryptocurrency, CryptocurrencyStore } from "./Cryptocurrency.ts"
import {
  CryptocurrencyCoingeckoIdExists,
  CryptocurrencyError,
  CryptocurrencyNotFound,
  CryptocurrencySlugExists
} from "./CryptocurrencyErrors.ts"
import { layer as CryptocurrencyStoreLive } from "./CryptocurrencyStore.ts"
import { decodeCursor, keysetWindow, pageWindow } from "./Pagination.ts"

const DatabaseTestLayer = Database.layerMemory()

const TestLayer = Cryptocurrency.layer.pipe(
  Layer.provide(CryptocurrencyStoreLive),
  Layer.provideMerge(DatabaseTestLayer)
)

const StoreTestLayer = CryptocurrencyStoreLive.pipe(Layer.provideMerge(DatabaseTestLayer))

const coinId = (value: number): CryptocurrencyId => Schema.decodeSync(CryptocurrencyId)(value)

const exchangeId = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

const chainId = (value: number): ChainId => Schema.decodeSync(ChainId)(value)

const run = <A, E>(effect: Effect.Effect<A, E, Cryptocurrency | Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped))

const runStore = <A, E>(effect: Effect.Effect<A, E, CryptocurrencyStore | Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(StoreTestLayer), Effect.scoped))

const bitcoin = {
  name: "Bitcoin",
  symbol: "BTC",
  slug: "bitcoin",
  logo: "bitcoin.svg",
  coingeckoId: "bitcoin"
} as const

describe("Cryptocurrency application service", () => {
  test("add creates a coin with generated id and timestamps", async () => {
    const created = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        return yield* service.add(bitcoin)
      })
    )

    expect(created.symbol).toBe("BTC")
    expect(created.coingeckoId).toBe("bitcoin")
    expect(created.id).toBeGreaterThan(0)
    expect(DateTime.isDateTime(created.createdAt)).toBe(true)
  })

  test("add rejects a duplicate coingeckoId", async () => {
    const error = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        yield* service.add(bitcoin)

        return yield* Effect.flip(service.add({ ...bitcoin, slug: "bitcoin-cash", name: "Bitcoin Cash" }))
      })
    )

    expect(error).toBeInstanceOf(CryptocurrencyError)
    expect(error.reason).toBeInstanceOf(CryptocurrencyCoingeckoIdExists)
  })

  test("add rejects a duplicate slug", async () => {
    const error = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        yield* service.add(bitcoin)

        return yield* Effect.flip(service.add({ ...bitcoin, coingeckoId: "litecoin" }))
      })
    )

    expect(error).toBeInstanceOf(CryptocurrencyError)
    expect(error.reason).toBeInstanceOf(CryptocurrencySlugExists)
  })

  test("getById returns the coin and reports missing ids", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        const created = yield* service.add(bitcoin)
        const found = yield* service.getById(created.id)
        const missing = yield* Effect.flip(service.getById(coinId(999)))

        return { found, missing }
      })
    )

    expect(result.found.symbol).toBe("BTC")
    expect(result.missing.reason).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("update changes fields and rejects conflicting unique values", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        const first = yield* service.add(bitcoin)
        const second = yield* service.add({ ...bitcoin, coingeckoId: "litecoin", slug: "litecoin", symbol: "LTC" })

        const updated = yield* service.update(first.id, {
          name: "Bitcoin (updated)",
          symbol: "BTC",
          slug: "bitcoin",
          coingeckoId: "bitcoin"
        })

        const cmcConflict = yield* Effect.flip(
          service.update(first.id, { name: "Bitcoin", symbol: "BTC", slug: "bitcoin", coingeckoId: second.coingeckoId })
        )

        const slugConflict = yield* Effect.flip(
          service.update(first.id, { name: "Bitcoin", symbol: "BTC", slug: "litecoin", coingeckoId: "bitcoin" })
        )

        const missing = yield* Effect.flip(
          service.update(coinId(999), { name: "missing", symbol: "MISS", slug: "missing", coingeckoId: "missing-coin" })
        )

        return { updated, cmcConflict, slugConflict, missing }
      })
    )

    expect(result.updated.name).toBe("Bitcoin (updated)")
    expect(result.updated.symbol).toBe("BTC")
    expect(result.cmcConflict.reason).toBeInstanceOf(CryptocurrencyCoingeckoIdExists)
    expect(result.slugConflict.reason).toBeInstanceOf(CryptocurrencySlugExists)
    expect(result.missing.reason).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("remove deletes the coin and reports missing ids", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        const created = yield* service.add(bitcoin)
        const removed = yield* service.remove(created.id)
        const missing = yield* Effect.flip(service.remove(created.id))

        return { removed, missing }
      })
    )

    expect(result.removed.symbol).toBe("BTC")
    expect(result.missing.reason).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("list searches, sorts, paginates, and reports meta", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        yield* service.add(bitcoin)
        yield* service.add({ ...bitcoin, coingeckoId: "litecoin", slug: "litecoin", symbol: "LTC", name: "Litecoin" })

        const searched = yield* service.list({
          window: pageWindow(1),
          limit: 10,
          search: "LTC",
          searchBy: ["symbol"],
          orderBy: "coingeckoId",
          order: "asc"
        })

        const multiField = yield* service.list({
          window: pageWindow(1),
          limit: 10,
          search: "litecoin",
          searchBy: ["symbol", "name"],
          orderBy: "coingeckoId",
          order: "asc"
        })

        const unlimited = yield* service.list({
          window: pageWindow(1),
          limit: -1,
          search: "",
          searchBy: ["symbol"],
          orderBy: "coingeckoId",
          order: "asc"
        })

        return { searched, multiField, unlimited }
      })
    )

    expect(result.searched.data.map((coin) => coin.symbol)).toEqual(["LTC"])
    expect(result.multiField.data.map((coin) => coin.symbol)).toEqual(["LTC"])
    expect(result.searched.meta.items).toBe(1)
    expect(result.searched.meta.hasNextPage).toBe(false)
    expect(result.unlimited.data.map((coin) => coin.symbol)).toEqual(["BTC", "LTC"])
    expect(result.unlimited.meta).toMatchObject({ items: 2, pages: 1, from: 1, to: 2 })
  })

  test("list filters by exchange and chain through market assignments", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency
        const { db } = yield* Database

        const btc = yield* service.add(bitcoin)
        const ltc = yield* service.add({ ...bitcoin, coingeckoId: "litecoin", slug: "litecoin", symbol: "LTC" })

        const [exchange] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "binance", name: "Binance", slug: "binance", logo: "binance.svg", baseCurrency: "usdt" })
          .returning()

        const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

        const [market] = yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: exchange!.id, cryptocurrencyId: btc.id, exchangeSymbol: "BTCUSDT" })
          .returning()

        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: market!.id,
          chainId: chain!.id,
          exchangeChainCode: "ERC20"
        })

        const byExchange = yield* service.list({
          window: pageWindow(1),
          limit: 10,
          search: "",
          searchBy: ["symbol"],
          orderBy: "coingeckoId",
          order: "asc",
          exchangeId: exchangeId(exchange!.id)
        })

        const byChain = yield* service.list({
          window: pageWindow(1),
          limit: 10,
          search: "",
          searchBy: ["symbol"],
          orderBy: "coingeckoId",
          order: "asc",
          chainId: chainId(chain!.id)
        })

        return { btc, ltc, byExchange, byChain }
      })
    )

    expect(result.byExchange.data.map((coin) => coin.symbol)).toEqual(["BTC"])
    expect(result.byChain.data.map((coin) => coin.symbol)).toEqual(["BTC"])
  })

  test("list follows keyset cursors without repeats", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency

        for (const [symbol, slug] of [["AAA", "aaa"], ["BBB", "bbb"], ["CCC", "ccc"]] as const) {
          yield* service.add({ ...bitcoin, coingeckoId: slug, slug, symbol, name: `Coin ${symbol}` })
        }

        const keyset = {
          window: keysetWindow(),
          limit: 2,
          search: "",
          searchBy: ["symbol"],
          orderBy: "symbol",
          order: "asc"
        } as const

        const first = yield* service.list(keyset)

        const nextWindow = keysetWindow(Option.getOrThrow(decodeCursor(first.nextCursor ?? "")))

        const second = yield* service.list({ ...keyset, window: nextWindow })

        return { first, second }
      })
    )

    expect(result.first.data.map((coin) => coin.symbol)).toEqual(["AAA", "BBB"])
    expect(result.second.data.map((coin) => coin.symbol)).toEqual(["CCC"])
    expect(result.second.nextCursor).toBeNull()
  })

  test("metadata groups exchange listings and chain routes", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency
        const { db } = yield* Database

        const btc = yield* service.add(bitcoin)

        const [exchange] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "binance", name: "Binance", slug: "binance", logo: "binance.svg", baseCurrency: "usdt" })
          .returning()

        const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

        const [market] = yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: exchange!.id, cryptocurrencyId: btc.id, exchangeSymbol: "BTCUSDT" })
          .returning()

        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: market!.id,
          chainId: chain!.id,
          exchangeChainCode: "ERC20"
        })

        const metadata = yield* service.metadata({ by: "slug", slug: "bitcoin" })
        const missing = yield* Effect.flip(service.metadata({ by: "slug", slug: "missing" }))

        return { metadata, missing }
      })
    )

    expect(result.metadata.exchanges).toHaveLength(1)
    expect(result.metadata.exchanges[0]?.symbol).toBe("BTCUSDT")
    expect(result.metadata.exchanges[0]?.chains[0]?.code).toBe("ETH")
    expect(result.missing.reason).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("stats counts markets, distinct chains, and blocked routes", async () => {
    const result = await run(
      Effect.gen(function*() {
        const service = yield* Cryptocurrency
        const { db } = yield* Database

        const btc = yield* service.add(bitcoin)

        const [first] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "binance", name: "Binance", slug: "binance", logo: "binance.svg", baseCurrency: "usdt" })
          .returning()

        const [second] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "bybit", name: "Bybit", slug: "bybit", logo: "bybit.svg", baseCurrency: "usdt" })
          .returning()

        const [chainOne] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()
        const [chainTwo] = yield* db.insert(chainTable).values({ name: "Tron", code: "TRX" }).returning()

        const [firstMarket] = yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: first!.id, cryptocurrencyId: btc.id, exchangeSymbol: "BTCUSDT" })
          .returning()

        const [secondMarket] = yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: second!.id, cryptocurrencyId: btc.id, exchangeSymbol: "BTCUSDT" })
          .returning()

        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: firstMarket!.id,
          chainId: chainOne!.id,
          exchangeChainCode: "ERC20",
          withdrawEnabled: false,
          depositEnabled: true
        })
        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: secondMarket!.id,
          chainId: chainTwo!.id,
          exchangeChainCode: "TRC20",
          withdrawEnabled: true,
          depositEnabled: false
        })

        const stats = yield* service.stats({
          page: 1,
          limit: 10,
          search: "",
          flag: "all",
          sortBy: "symbol",
          order: "asc"
        })

        const blocked = yield* service.stats({
          page: 1,
          limit: 10,
          search: "",
          flag: "blocked",
          sortBy: "blocked",
          order: "desc"
        })

        return { stats, blocked }
      })
    )

    expect(result.stats.data).toHaveLength(1)
    expect(result.stats.data[0]).toMatchObject({ symbol: "BTC", markets: 2, chains: 2, blocked: 2 })
    expect(result.stats.meta.items).toBe(1)
    expect(result.blocked.data.map((coin) => coin.symbol)).toEqual(["BTC"])
  })

  test("store insert translates unique violations into duplicate errors", async () => {
    const result = await runStore(
      Effect.gen(function*() {
        const store = yield* CryptocurrencyStore

        yield* store.insert(bitcoin)
        const cmcConflict = yield* Effect.flip(store.insert({ ...bitcoin, slug: "other" }))
        const slugConflict = yield* Effect.flip(store.insert({ ...bitcoin, coingeckoId: "litecoin" }))

        return { cmcConflict, slugConflict }
      })
    )

    expect(result.cmcConflict).toBeInstanceOf(CryptocurrencyCoingeckoIdExists)
    expect(result.slugConflict).toBeInstanceOf(CryptocurrencySlugExists)
  })
})
