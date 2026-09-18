import { describe, expect, test } from "bun:test"
import {
  Database,
  chainTable,
  cryptocurrencyTable,
  exchangeTable
} from "@lister/db"
import { ChainId, CryptocurrencyId, ExchangeId } from "@lister/domain"
import { Effect, Layer, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { layer as chainLinkStoreLayer } from "./ChainLinkStore.ts"
import { ChainLink } from "./ChainLink.ts"
import { ChainLinkHandlersNoDeps } from "./ChainLinkHandlers.ts"
import { CoinDetailEvents, type CoinDetailChange } from "./CoinDetailEvents.ts"
import { Market } from "./Market.ts"
import { MarketHandlersNoDeps } from "./MarketHandlers.ts"
import { layer as marketStoreLayer } from "./MarketStore.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

const recorded: Array<CoinDetailChange> = []

const RecordingEvents = Layer.succeed(
  CoinDetailEvents,
  CoinDetailEvents.of({
    publish: (change) =>
      Effect.sync(() => {
        recorded.push(change)
      })
  })
)

const MarketTestHandlers = MarketHandlersNoDeps.pipe(
  Layer.provide(Market.layer),
  Layer.provide(marketStoreLayer),
  Layer.provide(RecordingEvents),
  Layer.provideMerge(RequestValidationLive)
)

const ChainLinkTestHandlers = ChainLinkHandlersNoDeps.pipe(
  Layer.provide(ChainLink.layer),
  Layer.provide(chainLinkStoreLayer),
  Layer.provide(Market.layer),
  Layer.provide(marketStoreLayer),
  Layer.provide(RecordingEvents),
  Layer.provideMerge(RequestValidationLive)
)

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = Layer.mergeAll(MarketTestHandlers, ChainLinkTestHandlers).pipe(
  Layer.provideMerge(DatabaseTestLayer)
)

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["market", "chainLink"])

const exchangeId = (value: number): ExchangeId => Schema.decodeSync(ExchangeId)(value)

const cryptocurrencyId = (value: number): CryptocurrencyId => Schema.decodeSync(CryptocurrencyId)(value)

const chainId = (value: number): ChainId => Schema.decodeSync(ChainId)(value)

describe("coin-detail mutation events", () => {
  test("market and chain-link mutations publish reconciler events", async () => {
    recorded.length = 0

    await Effect.runPromise(
      Effect.gen(function*() {
        const { db } = yield* Database

        const [exchange] = yield* db
          .insert(exchangeTable)
          .values({
            cmcId: 270,
            name: "Binance",
            slug: "binance",
            logo: "binance.svg",
            baseCurrency: "usdt"
          })
          .returning()

        const [coin] = yield* db
          .insert(cryptocurrencyTable)
          .values({ cmcId: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin", logo: "btc.svg" })
          .returning()

        const [chain] = yield* db.insert(chainTable).values({ name: "Ethereum", code: "ETH" }).returning()

        const client = yield* makeClient

        const market = yield* client.market.assign({
          payload: {
            exchangeId: exchangeId(exchange!.id),
            cryptocurrencyId: cryptocurrencyId(coin!.id),
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          }
        })

        const link = yield* client.chainLink.add({
          payload: {
            exchangeCryptocurrencyId: market.id,
            chainId: chainId(chain!.id),
            exchangeChainCode: "ERC20",
            exchangeChainName: null,
            withdrawEnabled: true,
            depositEnabled: true
          }
        })

        yield* client.chainLink.remove({ params: { id: link.id } })
        yield* client.market.unassign({ params: { id: market.id } })
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
    )

    expect(recorded).toEqual([
      {
        kind: "mapping-added",
        exchangeId: 1,
        cryptocurrencyId: 1,
        exchangeCryptocurrencyId: 1
      },
      {
        kind: "chain-added",
        exchangeId: 1,
        cryptocurrencyId: 1,
        exchangeCryptocurrencyId: 1,
        chainId: 1
      },
      {
        kind: "chain-removed",
        exchangeId: 1,
        cryptocurrencyId: 1,
        exchangeCryptocurrencyId: 1,
        chainId: 1
      },
      {
        kind: "mapping-removed",
        exchangeId: 1,
        cryptocurrencyId: 1,
        exchangeCryptocurrencyId: 1
      }
    ])
  })
})
