import { describe, expect, test } from "bun:test"
import { Database, chainTable, exchangeTable } from "@lister/db"
import { exchangeCryptocurrencyChainTable, exchangeCryptocurrencyTable } from "@lister/db"
import { ExchangeId } from "@lister/domain"
import { DateTime, Effect, Layer, Option, Predicate, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ChainHandlers } from "./ChainHandlers.ts"
import { ChainLinkHandlers } from "./ChainLinkHandlers.ts"
import { CryptocurrencyHandlers } from "./CryptocurrencyHandlers.ts"
import { CryptocurrencyCoingeckoIdExists, CryptocurrencyNotFound } from "./CryptocurrencyErrors.ts"
import { ExchangeHandlers } from "./ExchangeHandlers.ts"
import { MarketHandlers } from "./MarketHandlers.ts"
import { type CursorPosition, decodeCursor } from "./Pagination.ts"
import { WorkerControl } from "./WorkerControl.ts"
import { WorkersHandlers } from "./WorkersHandlers.ts"

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = CryptocurrencyHandlers.pipe(Layer.provideMerge(DatabaseTestLayer))

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["cryptocurrency"])

type Client = Effect.Success<typeof makeClient>

const exchangeId = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

/**
 * Decode a response cursor, failing the test when none was returned.
 *
 * @param nextCursor - The `nextCursor` field of a keyset response.
 * @returns The decoded position, ready to send back as the next request's cursor.
 */
const cursorOf = (nextCursor: string | null | undefined): CursorPosition => {
  if (nextCursor === null || nextCursor === undefined) {
    throw new Error("expected the response to carry a cursor")
  }

  return Option.getOrThrowWith(decodeCursor(nextCursor), () => new Error("nextCursor did not decode"))
}

const runWithClient = <A, E>(f: (client: Client) => Effect.Effect<A, E, Database>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const client = yield* makeClient

      return yield* f(client)
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

const listPayload = {
  page: 1,
  limit: 10,
  search: "",
  searchBy: ["symbol"],
  orderBy: "coingeckoId",
  order: "asc"
} as const

const bitcoin = {
  name: "Bitcoin",
  symbol: "BTC",
  slug: "bitcoin",
  logo: "bitcoin.svg",
  coingeckoId: "bitcoin"
} as const

describe("cryptocurrency HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const created = yield* client.cryptocurrency.add({ payload: bitcoin })

        const listed = yield* client.cryptocurrency.list({
          payload: { ...listPayload, search: "BTC" }
        })

        const updated = yield* client.cryptocurrency.update({
          params: { id: created.id },
          payload: { name: "Bitcoin (updated)", symbol: "BTC", slug: "bitcoin", coingeckoId: "bitcoin" }
        })

        const fetched = yield* client.cryptocurrency.findById({ params: { id: created.id } })

        const removed = yield* client.cryptocurrency.remove({ params: { id: created.id } })

        const missing = yield* Effect.flip(client.cryptocurrency.findById({ params: { id: created.id } }))

        return { created, listed, updated, fetched, removed, missing }
      })
    )

    expect(result.created.symbol).toBe("BTC")
    expect(DateTime.isDateTime(result.created.createdAt)).toBe(true)
    expect(result.listed.data.map((coin) => coin.symbol)).toEqual(["BTC"])
    expect(result.updated.name).toBe("Bitcoin (updated)")
    expect(result.fetched.name).toBe("Bitcoin (updated)")
    expect(result.removed.symbol).toBe("BTC")
    expect(result.missing).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("rejects a duplicate coingeckoId with a conflict and persists no partial row", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.cryptocurrency.add({ payload: bitcoin })

        const conflict = yield* Effect.flip(
          client.cryptocurrency.add({ payload: { ...bitcoin, slug: "bitcoin-cash", name: "Bitcoin Cash" } })
        )

        const listed = yield* client.cryptocurrency.list({ payload: { ...listPayload, limit: -1 } })

        return { conflict, listed }
      })
    )

    expect(result.conflict).toBeInstanceOf(CryptocurrencyCoingeckoIdExists)
    expect(result.listed.meta.items).toBe(1)
    expect(result.listed.data).toHaveLength(1)
  })

  test("serves filtered listing stats and metadata", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { db } = yield* Database

        yield* client.cryptocurrency.add({ payload: bitcoin })
        yield* client.cryptocurrency.add({ payload: { ...bitcoin, coingeckoId: "litecoin", slug: "litecoin", symbol: "LTC" } })

        const [exchange] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "binance", name: "Binance", slug: "binance", logo: "binance.svg", baseCurrency: "usdt" })
          .returning()

        const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

        const [market] = yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: exchange!.id, cryptocurrencyId: 1, exchangeSymbol: "BTCUSDT" })
          .returning()

        yield* db.insert(exchangeCryptocurrencyChainTable).values({
          exchangeCryptocurrencyId: market!.id,
          chainId: chain!.id,
          exchangeChainCode: "ERC20"
        })

        const stats = yield* client.cryptocurrency.stats({
          payload: {
            ...listPayload,
            flag: "all",
            sortBy: "markets",
            order: "desc",
            exchangeId: exchangeId(exchange!.id)
          }
        })

        const metadata = yield* client.cryptocurrency.metadata({ payload: { slug: "bitcoin" } })

        const missing = yield* Effect.flip(client.cryptocurrency.metadata({ payload: { slug: "nope" } }))

        return { stats, metadata, missing }
      })
    )

    expect(result.stats.data.map((coin) => coin.symbol)).toEqual(["BTC"])
    expect(result.stats.meta.items).toBe(1)
    expect(result.metadata.exchanges[0]?.chains[0]?.code).toBe("ETH")
    expect(result.missing).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("filters stats before paging and pages them with cursors", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { db } = yield* Database

        yield* client.cryptocurrency.add({ payload: bitcoin })
        yield* client.cryptocurrency.add({
          payload: { ...bitcoin, coingeckoId: "litecoin", slug: "litecoin", symbol: "LTC", name: "Litecoin" }
        })
        yield* client.cryptocurrency.add({
          payload: { ...bitcoin, coingeckoId: "dogecoin", slug: "dogecoin", symbol: "DOGE", name: "Dogecoin" }
        })

        const [exchange] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "binance", name: "Binance", slug: "binance", logo: "binance.svg", baseCurrency: "usdt" })
          .returning()

        const [otherExchange] = yield* db
          .insert(exchangeTable)
          .values({ coingeckoId: "indodax", name: "Indodax", slug: "indodax", logo: "indodax.svg", baseCurrency: "idr" })
          .returning()

        // BTC lists twice across exchanges, DOGE once on the filtered
        // exchange, LTC only elsewhere.
        yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: exchange!.id, cryptocurrencyId: 1, exchangeSymbol: "BTCUSDT" })
        yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: otherExchange!.id, cryptocurrencyId: 1, exchangeSymbol: "BTCIDR" })
        yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: exchange!.id, cryptocurrencyId: 3, exchangeSymbol: "DOGEUSDT" })
        yield* db
          .insert(exchangeCryptocurrencyTable)
          .values({ exchangeId: otherExchange!.id, cryptocurrencyId: 2, exchangeSymbol: "LTCIDR" })

        const filter = { search: "", flag: "all", exchangeId: exchangeId(exchange!.id) } as const

        const page = yield* client.cryptocurrency.stats({
          payload: { ...filter, page: 1, limit: 10, sortBy: "symbol", order: "asc" }
        })

        const firstPage = yield* client.cryptocurrency.stats({
          payload: { ...filter, limit: 1, sortBy: "markets", order: "desc" }
        })

        const secondPage = yield* client.cryptocurrency.stats({
          payload: { ...filter, limit: 1, sortBy: "markets", order: "desc", cursor: cursorOf(firstPage.nextCursor) }
        })

        return { page, firstPage, secondPage }
      })
    )

    // The offset request reports totals for the filtered set, not all coins.
    expect(result.page.data.map((coin) => coin.symbol)).toEqual(["BTC", "DOGE"])
    expect(result.page.meta.items).toBe(2)
    expect("nextCursor" in result.page).toBe(false)

    // The count sort applies to the full filtered set: BTC has two markets.
    expect(result.firstPage.data.map((coin) => coin.symbol)).toEqual(["BTC"])
    expect(result.firstPage.meta.items).toBe(1)
    expect(result.secondPage.data.map((coin) => coin.symbol)).toEqual(["DOGE"])
    expect(result.secondPage.nextCursor).toBeNull()  })
})

describe("cryptocurrency HttpApi request errors", () => {
  test("maps malformed payloads to 422 and missing coins to 404", async () => {
    const ApiLayer = HttpApiBuilder.layer(Api).pipe(
      Layer.provide(CryptocurrencyHandlers),
      Layer.provide(ExchangeHandlers),
      Layer.provide(ChainHandlers),
      Layer.provide(MarketHandlers),
      Layer.provide(ChainLinkHandlers),
      Layer.provide(
        WorkersHandlers.pipe(
          Layer.provide(WorkerControl.layerTest([{ id: 1, slug: "indodax" }]))
        )
      ),
      Layer.provide(Database.layerMemory()),
      Layer.provide(HttpServer.layerServices)
    )

    const { handler, dispose } = HttpRouter.toWebHandler(ApiLayer, { disableLogger: true })

    try {
      const invalid = await handler(
        new Request("http://localhost/api/cryptocurrency/add", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "No symbol" })
        })
      )

      expect(invalid.status).toBe(422)
      expect(Predicate.isTagged(await invalid.json(), "InvalidRequest")).toBe(true)

      const missing = await handler(new Request("http://localhost/api/cryptocurrency/999"))

      expect(missing.status).toBe(404)
      expect(Predicate.isTagged(await missing.json(), "CryptocurrencyNotFound")).toBe(true)
    } finally {
      await dispose()
    }
  })
})
