import { describe, expect, test } from "bun:test"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { ChainId, MarketId } from "@lister/domain"
import { Effect, Layer, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ChainNotFound } from "./ChainErrors.ts"
import { ChainLinkCreatePayload } from "./ChainLinkApi.ts"
import { ChainLinkExists, ChainLinkNotFound } from "./ChainLinkErrors.ts"
import { ChainLinkHandlers } from "./ChainLinkHandlers.ts"
import { MarketNotFound } from "./MarketErrors.ts"

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = ChainLinkHandlers.pipe(Layer.provideMerge(DatabaseTestLayer))

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["chainLink"])

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

const marketId = (value: number): MarketId => Schema.decodeSync(MarketId)(value)

const chainId = (value: number): ChainId => Schema.decodeSync(ChainId)(value)

const binance = {
  cmcId: 270,
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
  cmcId: 1
} as const

const setup = Effect.gen(function*() {
  const { db } = yield* Database

  const exchange = yield* firstRow(yield* db.insert(exchangeTable).values(binance).returning())
  const coin = yield* firstRow(yield* db.insert(cryptocurrencyTable).values(bitcoin).returning())

  const market = yield* firstRow(
    yield* db
      .insert(exchangeCryptocurrencyTable)
      .values({ exchangeId: exchange.id, cryptocurrencyId: coin.id, exchangeSymbol: "BTCUSDT" })
      .returning()
  )

  const chain = yield* firstRow(
    yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()
  )

  return { market, chain }
})

describe("chainLink HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { market, chain } = yield* setup

        const link = {
          exchangeCryptocurrencyId: marketId(market.id),
          chainId: chainId(chain.id),
          exchangeChainCode: "ERC20",
          exchangeChainName: null,
          withdrawEnabled: true,
          depositEnabled: true
        }

        const created = yield* client.chainLink.add({ payload: link })

        const listed = yield* client.chainLink.list({
          payload: { exchangeCryptocurrencyId: link.exchangeCryptocurrencyId }
        })

        const fetched = yield* client.chainLink.findById({ params: { id: created.id } })

        const updated = yield* client.chainLink.update({
          params: { id: created.id },
          payload: { ...link, exchangeChainCode: "ERC20-v2", withdrawEnabled: false }
        })

        const removed = yield* client.chainLink.remove({ params: { id: created.id } })

        const missing = yield* Effect.flip(client.chainLink.findById({ params: { id: created.id } }))

        return { created, listed, fetched, updated, removed, missing }
      })
    )

    expect(result.created.exchangeChainCode).toBe("ERC20")
    expect(result.created.withdrawEnabled).toBe(true)
    expect(result.listed).toHaveLength(1)
    expect(result.listed[0]?.id).toBe(result.created.id)
    expect(result.fetched.chainId).toBe(result.created.chainId)
    expect(result.updated.exchangeChainCode).toBe("ERC20-v2")
    expect(result.updated.withdrawEnabled).toBe(false)
    expect(result.removed.id).toBe(result.created.id)
    expect(result.missing).toBeInstanceOf(ChainLinkNotFound)
  })

  test("rejects duplicate pairs and missing references", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const { market, chain } = yield* setup

        const link = {
          exchangeCryptocurrencyId: marketId(market.id),
          chainId: chainId(chain.id),
          exchangeChainCode: "ERC20",
          exchangeChainName: null,
          withdrawEnabled: true,
          depositEnabled: true
        }

        yield* client.chainLink.add({ payload: link })

        const duplicate = yield* Effect.flip(client.chainLink.add({ payload: link }))

        const missingMarket = yield* Effect.flip(
          client.chainLink.add({ payload: { ...link, exchangeCryptocurrencyId: marketId(9999) } })
        )

        const missingChain = yield* Effect.flip(
          client.chainLink.add({ payload: { ...link, chainId: chainId(9999) } })
        )

        return { duplicate, missingMarket, missingChain }
      })
    )

    expect(result.duplicate).toBeInstanceOf(ChainLinkExists)
    expect(result.missingMarket).toBeInstanceOf(MarketNotFound)
    expect(result.missingChain).toBeInstanceOf(ChainNotFound)
  })

  test("add payload applies the transfer defaults", () => {
    const decoded = Schema.decodeSync(ChainLinkCreatePayload)({
      exchangeCryptocurrencyId: 1,
      chainId: 1,
      exchangeChainCode: "ERC20",
      exchangeChainName: null
    })

    expect(decoded.withdrawEnabled).toBe(true)
    expect(decoded.depositEnabled).toBe(true)
  })
})
