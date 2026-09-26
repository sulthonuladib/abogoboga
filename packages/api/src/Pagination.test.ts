import { describe, expect, test } from "bun:test"
import { DateTime, Effect, Option, Result, Schema } from "effect"
import {
  Cursor,
  type CursorPosition,
  cursorMatchesSort,
  decodeCursor,
  encodeCursor,
  keysetMeta,
  keysetWindow,
  onlyOneWindow,
  pageWindow,
  PaginationQueryFields,
  paginationMeta,
  toCursorValue,
  toListWindow
} from "./Pagination.ts"

const position: CursorPosition = {
  orderBy: "name",
  direction: "asc",
  values: ["Ethereum", 7]
}

/**
 * Payload mirroring the list endpoints: shared pagination fields plus a sort,
 * checked with the same window and cursor validation.
 */
const ListPayload = Schema.Struct({
  ...PaginationQueryFields,
  orderBy: Schema.Literals(["id", "name"]).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("id"))),
  order: PaginationQueryFields.order
}).check(
  Schema.makeFilter(onlyOneWindow),
  Schema.makeFilter((payload) => cursorMatchesSort(payload.cursor, payload))
)

const decodePayload = Schema.decodeUnknownResult(ListPayload)

/**
 * Decode a payload, failing the test when decoding fails.
 *
 * @param input - Raw payload to decode.
 * @returns The decoded payload.
 */
const decodedPayload = (input: typeof ListPayload.Encoded): typeof ListPayload.Type => {
  const decoded = decodePayload(input)

  if (Result.isFailure(decoded)) {
    throw new Error(`expected the payload to decode: ${decoded.failure.message}`)
  }

  return decoded.success
}

describe("cursor codec", () => {
  test("round-trips a position", () => {
    const encoded = encodeCursor(position)
    const decoded = decodeCursor(encoded)

    expect(Option.isSome(decoded)).toBe(true)
    expect(Option.getOrThrow(decoded)).toEqual(position)
  })

  test("round-trips values containing unicode", () => {
    const encoded = encodeCursor({ ...position, values: ["Ethereum — Ancien", 1] })
    const decoded = decodeCursor(encoded)

    expect(Option.getOrThrow(decoded).values).toEqual(["Ethereum — Ancien", 1])
  })

  test("rejects strings that are not cursors", () => {
    expect(Option.isNone(decodeCursor("not-a-cursor"))).toBe(true)
    expect(Option.isNone(decodeCursor("eyJvcmRlckJ5IjoxfQ"))).toBe(true)
  })

  test("renders timestamps as ISO strings", () => {
    const timestamp = DateTime.makeUnsafe("2026-09-27T06:00:00.000Z")

    expect(toCursorValue(timestamp)).toBe("2026-09-27T06:00:00.000Z")
  })
})

describe("list payload windows", () => {
  test("defaults to the first keyset window without page or cursor", () => {
    const decoded = decodedPayload({ limit: 5 })

    expect(decoded.page).toBeUndefined()
    expect(decoded.cursor).toBeUndefined()
    expect(toListWindow(decoded)).toEqual(keysetWindow())
  })

  test("selects the offset window when a page is supplied", () => {
    expect(toListWindow(decodedPayload({ page: 3, limit: 5 }))).toEqual(pageWindow(3))
  })

  test("decodes a valid cursor into the keyset window", () => {
    const decoded = decodedPayload({ limit: 5, orderBy: "name", cursor: encodeCursor(position) })

    expect(decoded.cursor).toEqual(position)
    expect(toListWindow(decoded)).toEqual(keysetWindow(position))
  })

  test("rejects a page and a cursor together", () => {
    const decoded = decodePayload({ page: 1, limit: 5, cursor: encodeCursor(position) })

    expect(Result.isFailure(decoded)).toBe(true)
  })

  test("rejects a cursor from a different sort", () => {
    expect(Result.isFailure(decodePayload({ limit: 5, orderBy: "id", cursor: encodeCursor(position) }))).toBe(true)

    const reversed = decodePayload({
      limit: 5,
      orderBy: "name",
      order: "desc",
      cursor: encodeCursor(position)
    })

    expect(Result.isFailure(reversed)).toBe(true)
  })

  test("rejects a malformed cursor as a request error", () => {
    expect(Result.isFailure(decodePayload({ limit: 5, cursor: "%%%" }))).toBe(true)
  })

  test("exposes the opaque cursor schema as a string on the wire", () => {
    const encoded = Schema.encodeSync(Cursor)(position)

    expect(encoded).toBeString()
    expect(Schema.decodeSync(Cursor)(encoded)).toEqual(position)
  })
})

describe("pagination meta", () => {
  test("describes a keyset window with and without a continuation", () => {
    const continuing = keysetMeta({
      items: 2,
      limit: 2,
      hasMore: true,
      search: "",
      searchBy: "name",
      order: "asc",
      orderBy: "name"
    })

    expect(continuing).toMatchObject({
      items: 2,
      pages: 1,
      page: 1,
      from: 1,
      to: 2,
      hasNextPage: true,
      hasPreviousPage: false
    })

    const last = keysetMeta({
      items: 2,
      limit: 2,
      hasMore: false,
      search: "",
      searchBy: "name",
      order: "asc",
      orderBy: "name"
    })

    expect(last.hasNextPage).toBe(false)
  })

  test("describes an empty keyset page", () => {
    const meta = keysetMeta({
      items: 0,
      limit: 2,
      hasMore: false,
      search: "",
      searchBy: "name",
      order: "asc",
      orderBy: "name"
    })

    expect(meta).toMatchObject({ items: 0, pages: 0, page: 1, from: 0, to: 0, hasNextPage: false })
  })

  test("keeps the legacy unlimited page summary", () => {
    const meta = paginationMeta({
      items: 4,
      page: 1,
      limit: -1,
      search: "",
      searchBy: "name",
      order: "asc",
      orderBy: "name"
    })

    expect(meta).toMatchObject({ items: 4, pages: 1, from: 1, to: 4, hasNextPage: false })
  })
})
