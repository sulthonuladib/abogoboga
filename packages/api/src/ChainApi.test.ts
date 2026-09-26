import { describe, expect, test } from "bun:test"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ChainHandlers } from "./ChainHandlers.ts"
import { ChainCodeExists, ChainNotFound } from "./ChainErrors.ts"

const DatabaseTestLayer = Database.layerMemory()

const HandlersLayer = ChainHandlers.pipe(Layer.provideMerge(DatabaseTestLayer))

const TestLayer = Layer.mergeAll(HandlersLayer, HttpServer.layerServices)

const makeClient = HttpApiTest.groups(Api, ["chain"])

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

const ethereum = {
  name: "Ethereum",
  code: "ETH"
} as const

describe("chain HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const created = yield* client.chain.add({ payload: ethereum })

        const listed = yield* client.chain.list({
          payload: { ...listPayload, search: "eth", searchBy: "code" }
        })

        const updated = yield* client.chain.update({
          params: { id: created.id },
          payload: { name: "Ethereum (updated)", code: "ETH" }
        })

        const fetched = yield* client.chain.findById({ params: { id: created.id } })

        const removed = yield* client.chain.remove({ params: { id: created.id } })

        const missing = yield* Effect.flip(client.chain.findById({ params: { id: created.id } }))

        return { created, listed, updated, fetched, removed, missing }
      })
    )

    expect(result.created.code).toBe("ETH")
    expect(result.listed.data.map((chain) => chain.code)).toEqual(["ETH"])
    expect(result.listed.meta).toMatchObject({ items: 1, pages: 1, from: 1, to: 1 })
    expect(result.updated.name).toBe("Ethereum (updated)")
    expect(result.fetched.name).toBe("Ethereum (updated)")
    expect(result.removed.name).toBe("Ethereum (updated)")
    expect(result.missing).toBeInstanceOf(ChainNotFound)
  })

  test("rejects a duplicate code with a conflict", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.chain.add({ payload: ethereum })

        const conflict = yield* Effect.flip(
          client.chain.add({ payload: { name: "Ether", code: "ETH" } })
        )

        const listed = yield* client.chain.list({ payload: { ...listPayload, limit: -1 } })

        return { conflict, listed }
      })
    )

    expect(result.conflict).toBeInstanceOf(ChainCodeExists)
    expect(result.listed.meta.items).toBe(1)
    expect(result.listed.data).toHaveLength(1)
  })
})
