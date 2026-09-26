import { describe, expect, test } from "bun:test"
import { Database } from "@lister/db"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ExchangeCreatePayload } from "./ExchangeApi.ts"
import { ExchangeCoingeckoIdExists, ExchangeNotFound, ExchangeSlugExists } from "./ExchangeErrors.ts"
import { ExchangeHandlers } from "./ExchangeHandlers.ts"
import { type CursorPosition, decodeCursor } from "./Pagination.ts"

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
  searchBy: ["name"],
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

  test("pages exchanges with keyset cursors without repeats", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        for (const slug of ["alpha", "beta", "gamma"]) {
          yield* client.exchange.add({
            payload: { ...binance, coingeckoId: slug, slug, name: `Exchange ${slug}` }
          })
        }

        const keyset = { limit: 2, search: "", searchBy: ["slug"], orderBy: "slug", order: "asc" } as const

        const first = yield* client.exchange.list({ payload: keyset })

        const second = yield* client.exchange.list({
          payload: { ...keyset, cursor: cursorOf(first.nextCursor) }
        })

        return { first, second }
      })
    )

    expect(result.first.data.map((exchange) => exchange.slug)).toEqual(["alpha", "beta"])
    expect(result.second.data.map((exchange) => exchange.slug)).toEqual(["gamma"])
    expect(result.second.nextCursor).toBeNull()
  })

  test("searches exchanges across name and slug with literal wildcards", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.exchange.add({ payload: binance })
        yield* client.exchange.add({
          payload: { ...binance, coingeckoId: "binance-us", slug: "binance-us", name: "Binance US" }
        })
        yield* client.exchange.add({
          payload: { ...binance, coingeckoId: "percent", slug: "100%-venue", name: "100% Venue" }
        })
        yield* client.exchange.add({
          payload: { ...binance, coingeckoId: "underscore", slug: "a_b-venue", name: "A_B Venue" }
        })
        yield* client.exchange.add({
          payload: { ...binance, coingeckoId: "axb", slug: "axb-venue", name: "AXB Venue" }
        })

        const search = (value: string, searchBy: ReadonlyArray<"name" | "slug">) =>
          client.exchange.list({ payload: { ...listPayload, limit: -1, search: value, searchBy } })

        const bothFields = yield* search("binance", ["name", "slug"])
        const slugOnly = yield* search("binance-us", ["slug"])
        const literalPercent = yield* search("100%", ["slug"])
        const literalUnderscore = yield* search("a_b", ["slug"])

        return { bothFields, slugOnly, literalPercent, literalUnderscore }
      })
    )

    expect(result.bothFields.data.map((exchange) => exchange.slug)).toEqual(["binance", "binance-us"])
    expect(result.slugOnly.data.map((exchange) => exchange.slug)).toEqual(["binance-us"])
    expect(result.literalPercent.data.map((exchange) => exchange.slug)).toEqual(["100%-venue"])
    expect(result.literalUnderscore.data.map((exchange) => exchange.slug)).toEqual(["a_b-venue"])
  })
})
