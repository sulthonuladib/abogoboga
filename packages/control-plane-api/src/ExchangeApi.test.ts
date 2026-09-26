import { describe, expect, test } from "bun:test"
import { Database } from "@lister/db"
import { Effect, Layer, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ExchangeCreatePayload } from "./ExchangeApi.ts"
import { ExchangeCoingeckoIdExists, ExchangeNotFound, ExchangeSlugExists } from "./ExchangeErrors.ts"
import { ExchangeHandlers } from "./ExchangeHandlers.ts"

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = ExchangeHandlers.pipe(Layer.provideMerge(DatabaseTestLayer))

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["exchange"])

type Client = Effect.Success<typeof makeClient>

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
  searchBy: "name",
  orderBy: "id",
  order: "asc"
} as const

const binance = {
  coingeckoId: "binance",
  name: "Binance",
  slug: "binance",
  logo: "binance.svg",
  registeredOnCmc: true,
  baseCurrency: "usdt"
} as const

describe("exchange HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const created = yield* client.exchange.add({ payload: binance })

        const listed = yield* client.exchange.list({
          payload: { ...listPayload, search: "binance" }
        })

        const updated = yield* client.exchange.update({
          params: { id: created.id },
          payload: { ...binance, name: "Binance (updated)" }
        })

        const fetched = yield* client.exchange.findById({ params: { id: created.id } })

        const removed = yield* client.exchange.remove({ params: { id: created.id } })

        const missing = yield* Effect.flip(client.exchange.findById({ params: { id: created.id } }))

        return { created, listed, updated, fetched, removed, missing }
      })
    )

    expect(result.created.slug).toBe("binance")
    expect(result.created.registeredOnCmc).toBe(true)
    expect(result.listed.data.map((exchange) => exchange.slug)).toEqual(["binance"])
    expect(result.listed.meta).toMatchObject({ items: 1, pages: 1, from: 1, to: 1 })
    expect(result.updated.name).toBe("Binance (updated)")
    expect(result.fetched.name).toBe("Binance (updated)")
    expect(result.removed.coingeckoId).toBe("binance")
    expect(result.missing).toBeInstanceOf(ExchangeNotFound)
  })

  test("rejects duplicate coingeckoId and slug with conflicts", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.exchange.add({ payload: binance })

        const cmcConflict = yield* Effect.flip(
          client.exchange.add({ payload: { ...binance, slug: "binance-us" } })
        )

        const slugConflict = yield* Effect.flip(
          client.exchange.add({ payload: { ...binance, coingeckoId: "binance-us" } })
        )

        const listed = yield* client.exchange.list({ payload: { ...listPayload, limit: -1 } })

        return { cmcConflict, slugConflict, listed }
      })
    )

    expect(result.cmcConflict).toBeInstanceOf(ExchangeCoingeckoIdExists)
    expect(result.slugConflict).toBeInstanceOf(ExchangeSlugExists)
    expect(result.listed.meta.items).toBe(1)
    expect(result.listed.data).toHaveLength(1)
  })

  test("create payload applies the registeredOnCmc default", () => {
    const decoded = Schema.decodeSync(ExchangeCreatePayload)({
      coingeckoId: "binance",
      name: "Binance",
      slug: "binance",
      logo: "binance.svg",
      baseCurrency: "usdt"
    })

    expect(decoded.registeredOnCmc).toBe(true)
  })
})
