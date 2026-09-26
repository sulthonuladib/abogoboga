import { describe, expect, test } from "bun:test"
import { Database } from "@lister/db"
import { Effect, Layer, Option } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ChainHandlers } from "./ChainHandlers.ts"
import { ChainCodeExists, ChainNotFound } from "./ChainErrors.ts"
import { type CursorPosition, decodeCursor } from "./Pagination.ts"

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
  searchBy: ["name"],
  orderBy: "id",
  order: "asc"
} as const

const ethereum = {
  name: "Ethereum",
  code: "ETH"
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

describe("chain HttpApi", () => {
  test("covers the full resource lifecycle", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const created = yield* client.chain.add({ payload: ethereum })

        const listed = yield* client.chain.list({
          payload: { ...listPayload, search: "eth", searchBy: ["code"] }
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

  test("keeps offset responses free of a continuation cursor", async () => {
    const listed = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.chain.add({ payload: ethereum })

        return yield* client.chain.list({ payload: listPayload })
      })
    )

    expect("nextCursor" in listed).toBe(false)
  })

  test("pages chains with keyset cursors without repeats", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        for (const code of ["AAA", "BBB", "CCC", "DDD", "EEE"]) {
          yield* client.chain.add({ payload: { name: `Chain ${code}`, code } })
        }

        const keyset = { limit: 2, search: "", searchBy: ["code"], orderBy: "code", order: "asc" } as const

        const first = yield* client.chain.list({ payload: keyset })

        const second = yield* client.chain.list({
          payload: { ...keyset, cursor: cursorOf(first.nextCursor) }
        })

        const third = yield* client.chain.list({
          payload: { ...keyset, cursor: cursorOf(second.nextCursor) }
        })

        const past = yield* client.chain.list({
          payload: { ...keyset, cursor: { orderBy: "code", direction: "asc", values: ["ZZZ", 999_999] } }
        })

        return { first, second, third, past }
      })
    )

    expect(result.first.data.map((chain) => chain.code)).toEqual(["AAA", "BBB"])
    expect(result.first.nextCursor).toBeString()
    expect(result.first.meta).toMatchObject({ page: 1, hasNextPage: true, hasPreviousPage: false })
    expect(result.second.data.map((chain) => chain.code)).toEqual(["CCC", "DDD"])
    expect(result.third.data.map((chain) => chain.code)).toEqual(["EEE"])
    expect(result.third.nextCursor).toBeNull()
    expect(result.third.meta.hasNextPage).toBe(false)
    expect(result.past.data).toEqual([])
    expect(result.past.nextCursor).toBeNull()
  })

  test("searches chains across name and code with literal wildcards", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.chain.add({ payload: ethereum })
        yield* client.chain.add({ payload: { name: "Ethereum Classic", code: "ETC" } })
        yield* client.chain.add({ payload: { name: "100% On-Chain", code: "PCT" } })
        yield* client.chain.add({ payload: { name: "A_B Network", code: "ABN" } })
        yield* client.chain.add({ payload: { name: "AXB Network", code: "AXB" } })

        const search = (value: string, searchBy: ReadonlyArray<"name" | "code">) =>
          client.chain.list({ payload: { ...listPayload, limit: -1, search: value, searchBy } })

        const bothFields = yield* search("eth", ["name", "code"])
        const codeOnly = yield* search("eth", ["code"])
        const literalPercent = yield* search("100%", ["name"])
        const literalUnderscore = yield* search("a_b", ["name"])
        const empty = yield* search("", ["name", "code"])

        return { bothFields, codeOnly, literalPercent, literalUnderscore, empty }
      })
    )

    expect(result.bothFields.data.map((chain) => chain.code)).toEqual(["ETH", "ETC"])
    expect(result.codeOnly.data.map((chain) => chain.code)).toEqual(["ETH"])
    expect(result.literalPercent.data.map((chain) => chain.code)).toEqual(["PCT"])
    expect(result.literalUnderscore.data.map((chain) => chain.code)).toEqual(["ABN"])
    expect(result.empty.meta.items).toBe(5)
  })

  test("find-or-create returns the existing chain for a known code", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const created = yield* client.chain.findOrCreate({ payload: ethereum })
        const again = yield* client.chain.findOrCreate({ payload: { name: "Ether", code: "ETH" } })
        const listed = yield* client.chain.list({ payload: { ...listPayload, limit: -1 } })

        return { created, again, listed }
      })
    )

    expect(result.again.id).toBe(result.created.id)
    expect(result.again.name).toBe("Ethereum")
    expect(result.listed.meta.items).toBe(1)
  })

  test("concurrent find-or-create requests converge on one chain", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const [left, right] = yield* Effect.all(
          [
            client.chain.findOrCreate({ payload: { name: "Ethereum", code: "ETH" } }),
            client.chain.findOrCreate({ payload: { name: "Ethereum", code: "ETH" } })
          ],
          { concurrency: "unbounded" }
        )

        const listed = yield* client.chain.list({ payload: { ...listPayload, limit: -1 } })

        return { left, right, listed }
      })
    )

    expect(result.left.id).toBe(result.right.id)
    expect(result.listed.meta.items).toBe(1)
    expect(result.listed.data[0]?.id).toBe(result.left.id)
  })
})
