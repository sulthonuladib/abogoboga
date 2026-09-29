import { describe, expect, test } from "bun:test"
import { Database, cryptocurrencyTable, exchangeTable } from "@lister/db"
import { CryptocurrencyId, ExchangeId } from "@lister/domain"
import { Effect, Layer, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { CryptocurrencyNotFound } from "./CryptocurrencyErrors.ts"
import { ExchangeNotFound } from "./ExchangeErrors.ts"
import { MarketCreatePayload } from "./MarketApi.ts"
import { MarketExists, MarketNotFound } from "./MarketErrors.ts"
import { MarketHandlers } from "./MarketHandlers.ts"
import { CoinDetailEvents } from "./CoinDetailEvents.ts"

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = MarketHandlers.pipe(
  Layer.provide(CoinDetailEvents.layerNoop),
  Layer.provideMerge(DatabaseTestLayer)
)

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["market"])

type Client = Effect.Success<typeof makeClient>

const runWithClient = <A, E>(f: (client: Client) => Effect.Effect<A, E, Database>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const client = yield* makeClient

      return yield* f(client)
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

const firstRow = <A>(rows: ReadonlyArray<A>): Effect.Effect<A> => {
  const [first] = rows

  return first === undefined ? Effect.die(new Error("insert returned no row")) : Effect.succeed(first)
}

const exchangeId = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

const cryptocurrencyId = (value: number): CryptocurrencyId => Schema.decodeSync(CryptocurrencyId)(value)

const binance = {
  coingeckoId: "binance",
  name: "Binance",
  slug: "binance",
  logo: "binance.svg",
  baseCurrency: "usdt"
} as const

const bitcoin = {
  name: "Bitcoin",
  symbol: "BTC",
  slug: "bitcoin",
  logo: "bitcoin.svg",
  coingeckoId: "bitcoin"
} as const

const setup = Effect.gen(function*() {
  const { db } = yield* Database

  const exchange = yield* firstRow(yield* db.insert(exchangeTable).values(binance).returning())
  const coin = yield* firstRow(yield* db.insert(cryptocurrencyTable).values(bitcoin).returning())

  return { exchange, coin }
})

describe("market HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { exchange, coin } = yield* setup
        const marketExchangeId = exchangeId(exchange.id)
        const marketCryptocurrencyId = cryptocurrencyId(coin.id)

        const assigned = yield* client.market.assign({
          payload: {
            exchangeId: marketExchangeId,
            cryptocurrencyId: marketCryptocurrencyId,
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          }
        })

        const listed = yield* client.market.list({ payload: { exchangeId: marketExchangeId } })
        const counted = yield* client.market.count({ payload: { exchangeId: marketExchangeId } })

        const fetched = yield* client.market.findById({ params: { id: assigned.id } })

        const updated = yield* client.market.update({
          params: { id: assigned.id },
          payload: {
            exchangeId: marketExchangeId,
            cryptocurrencyId: marketCryptocurrencyId,
            exchangeSymbol: "BTCIDR",
            listed: false,
            tradeEnabled: true
          }
        })

        const removed = yield* client.market.unassign({ params: { id: assigned.id } })

        const missing = yield* Effect.flip(client.market.findById({ params: { id: assigned.id } }))

        return { assigned, listed, counted, fetched, updated, removed, missing }
      })
    )

    expect(result.assigned.listed).toBe(true)
    expect(result.assigned.exchangeSymbol).toBe("BTCUSDT")
    expect(result.listed).toHaveLength(1)
    expect(result.listed[0]?.id).toBe(result.assigned.id)
    expect(result.counted).toBe(1)
    expect(result.fetched.exchangeSymbol).toBe("BTCUSDT")
    expect(result.updated.exchangeSymbol).toBe("BTCIDR")
    expect(result.updated.listed).toBe(false)
    expect(result.removed.id).toBe(result.assigned.id)
    expect(result.missing).toBeInstanceOf(MarketNotFound)
  })

  test("rejects duplicate pairs and missing references", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { exchange, coin } = yield* setup
        const marketExchangeId = exchangeId(exchange.id)
        const marketCryptocurrencyId = cryptocurrencyId(coin.id)

        yield* client.market.assign({
          payload: {
            exchangeId: marketExchangeId,
            cryptocurrencyId: marketCryptocurrencyId,
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          }
        })

        const duplicate = yield* Effect.flip(
          client.market.assign({
            payload: {
              exchangeId: marketExchangeId,
              cryptocurrencyId: marketCryptocurrencyId,
              exchangeSymbol: "BTCUSDT",
              listed: true,
              tradeEnabled: true
            }
          })
        )

        const missingExchange = yield* Effect.flip(
          client.market.assign({
            payload: {
              exchangeId: exchangeId(9999),
              cryptocurrencyId: marketCryptocurrencyId,
              exchangeSymbol: "BTCUSDT",
              listed: true,
              tradeEnabled: true
            }
          })
        )

        const missingCoin = yield* Effect.flip(
          client.market.assign({
            payload: {
              exchangeId: marketExchangeId,
              cryptocurrencyId: cryptocurrencyId(9999),
              exchangeSymbol: "BTCUSDT",
              listed: true,
              tradeEnabled: true
            }
          })
        )

        return { duplicate, missingExchange, missingCoin }
      })
    )

    expect(result.duplicate).toBeInstanceOf(MarketExists)
    expect(result.missingExchange).toBeInstanceOf(ExchangeNotFound)
    expect(result.missingCoin).toBeInstanceOf(CryptocurrencyNotFound)
  })

  test("assign payload applies the listing defaults", () => {
    const decoded = Schema.decodeSync(MarketCreatePayload)({
      exchangeId: 1,
      cryptocurrencyId: 1,
      exchangeSymbol: "BTCUSDT"
    })

    expect(decoded.listed).toBe(true)
    expect(decoded.tradeEnabled).toBe(true)
  })
})
