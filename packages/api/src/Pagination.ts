import { Data, DateTime, Effect, Option, Predicate, Schema, SchemaGetter, SchemaIssue } from "effect"

/**
 * Decoded keyset cursor: the position of the last row on a page, together with
 * the sort configuration it was produced under.
 *
 * `values` holds the row's sort-key values in comparison order, with the row id
 * last as the total-order tiebreak. Which keys a query uses is a property of
 * the endpoint, so `values` is intentionally unaware of column names: a list
 * keyed on `name` stores `[name, id]`, a stats page keyed on a coverage count
 * stores `[count, symbol, id]`.
 */
export const CursorPosition = Schema.Struct({
  orderBy: Schema.String.pipe(Schema.check(Schema.isMaxLength(32))),
  direction: Schema.Literals(["asc", "desc"]),
  values: Schema.Array(Schema.Union([Schema.String, Schema.Finite])).pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(8))
  )
})

/**
 * Decoded keyset cursor.
 */
export type CursorPosition = typeof CursorPosition.Type

const encodeBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ""

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

const decodeBase64Url = (value: string): Option.Option<string> => {
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

    return Option.some(new TextDecoder().decode(bytes))
  } catch {
    return Option.none()
  }
}

/**
 * Encode a keyset position as the opaque cursor sent to clients.
 *
 * @param position - The position to encode.
 * @returns The opaque `cursor`/`nextCursor` string.
 */
export const encodeCursor = (position: CursorPosition): string => encodeBase64Url(JSON.stringify(position))

/**
 * Decode an opaque cursor string.
 *
 * @param raw - The opaque cursor string from a request.
 * @returns The decoded position, or `none` when the string is not a cursor.
 */
export const decodeCursor = (raw: string): Option.Option<CursorPosition> =>
  Option.flatMap(decodeBase64Url(raw), (json) => {
    try {
      return Schema.decodeUnknownOption(CursorPosition)(JSON.parse(json))
    } catch {
      return Option.none()
    }
  })

/**
 * Render a model's sort value as a cursor-safe scalar.
 *
 * Timestamps travel as ISO strings so cursors stay JSON; the database casts
 * them back when the predicate compares against a timestamp column.
 *
 * @param value - A row's sort-key value.
 * @returns The value as it is stored in a cursor.
 */
export const toCursorValue = (value: string | number | DateTime.DateTime): string | number => {
  if (Predicate.isString(value) || Predicate.isNumber(value)) {
    return value
  }

  return DateTime.formatIso(value)
}

/**
 * Opaque cursor transport schema: a base64url-encoded {@link CursorPosition}
 * on the wire, decoded for application code.
 */
export const Cursor = Schema.String.pipe(
  Schema.decodeTo(CursorPosition, {
    decode: SchemaGetter.transformEffect((raw: string) =>
      Effect.fromOption(
        decodeCursor(raw),
        () => new SchemaIssue.InvalidValue({ message: "not a valid pagination cursor" })
      )
    ),
    encode: SchemaGetter.transform((position) => encodeCursor(position))
  })
)

/**
 * Pagination summary returned alongside every list or stats response.
 *
 * `items`/`pages`/`page`/`limit`/`from`/`to` describe the window; the remaining
 * fields echo the query that produced it so clients can render table state.
 */
export const PaginationMeta = Schema.Struct({
  items: Schema.Int,
  pages: Schema.Int,
  page: Schema.Int,
  limit: Schema.Int,
  from: Schema.Int,
  to: Schema.Int,
  hasNextPage: Schema.Boolean,
  hasPreviousPage: Schema.Boolean,
  search: Schema.String.pipe(Schema.check(Schema.isMaxLength(100))),
  searchBy: Schema.String.pipe(Schema.check(Schema.isMaxLength(32))),
  order: Schema.String.pipe(Schema.check(Schema.isMaxLength(32))),
  orderBy: Schema.String.pipe(Schema.check(Schema.isMaxLength(32)))
})

/**
 * Decoded pagination summary.
 */
export type PaginationMeta = typeof PaginationMeta.Type

/**
 * Query fields shared by every paginated list: text search, page window, and
 * sort order.
 *
 * `page` is optional so a request can select the keyset window instead. A
 * request that supplies neither `page` nor `cursor` follows the keyset path
 * from the first row, matching the "first page returns a cursor" contract.
 */
export const PaginationQueryFields = {
  page: Schema.optional(
    Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))
  ),
  limit: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(-1)),
    Schema.check(Schema.isLessThanOrEqualTo(100)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(10))
  ),
  cursor: Schema.optional(Cursor),
  search: Schema.String.pipe(
    Schema.check(Schema.isMaxLength(100)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("asc")))
} as const

/**
 * Selected window for a paginated query.
 *
 * `Page` uses the offset window of the legacy API; `Keyset` continues from an
 * optional decoded cursor and is the default when no page is requested.
 */
export type ListWindow = Data.TaggedEnum<{
  /** Offset window: a one-based page number. */
  Page: { readonly page: number }
  /** Keyset window: `cursor` is `undefined` for the first page. */
  Keyset: { readonly cursor: CursorPosition | undefined }
}>

/**
 * Constructors for {@link ListWindow}.
 */
export const ListWindow = Data.taggedEnum<ListWindow>()

/**
 * Build an offset window.
 *
 * @param page - One-based page number.
 * @returns The page window.
 */
export const pageWindow = (page: number): ListWindow => ListWindow.Page({ page })

/**
 * Build a keyset window.
 *
 * @param cursor - Decoded cursor to continue after, or `undefined` for the first page.
 * @returns The keyset window.
 */
export const keysetWindow = (cursor?: CursorPosition): ListWindow => ListWindow.Keyset({ cursor })

/**
 * Select the window requested by a decoded list payload.
 *
 * @param payload - A payload carrying the optional `page` and `cursor` fields.
 * @returns The keyset window when the payload omits `page`, the offset window otherwise.
 */
export const toListWindow = (payload: {
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
}): ListWindow =>
  payload.page !== undefined ? pageWindow(payload.page) : keysetWindow(payload.cursor)

/**
 * Store result for a paginated query, tagged by the window it came from.
 *
 * @template Row - Row type held by the window.
 */
export type ListResult<Row> = Data.TaggedEnum<{
  /** Offset window result: the rows, the unpaginated total, and the requested page. */
  Page: {
    readonly rows: ReadonlyArray<Row>
    readonly total: number
    /** Echo of the requested page, so meta building does not re-narrow the window. */
    readonly page: number
  }
  /** Keyset window result: the rows and whether more exist after them. */
  Keyset: {
    readonly rows: ReadonlyArray<Row>
    readonly hasMore: boolean
  }
}>

/**
 * Definition carrying the row generic for {@link ListResult} constructors.
 */
interface ListResultDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: ListResult<this["A"]>
}

const ListResult = Data.taggedEnum<ListResultDefinition>()

/**
 * Build the result of an offset window.
 *
 * @template Row - Row type held by the window.
 * @param input - Rows, unpaginated total, and the requested page.
 * @returns The tagged page result.
 */
export const pageListResult = <Row>(input: {
  readonly rows: ReadonlyArray<Row>
  readonly total: number
  readonly page: number
}): ListResult<Row> => ListResult.Page(input)

/**
 * Build the result of a keyset window.
 *
 * @template Row - Row type held by the window.
 * @param input - Rows and whether more exist after them.
 * @returns The tagged keyset result.
 */
export const keysetListResult = <Row>(input: {
  readonly rows: ReadonlyArray<Row>
  readonly hasMore: boolean
}): ListResult<Row> => ListResult.Keyset(input)

/**
 * A `data` page, its {@link PaginationMeta}, and the keyset continuation when
 * the request selected the keyset window. `nextCursor` is omitted for
 * page-based responses so their JSON shape is unchanged.
 *
 * @template Item - Schema of a single row.
 * @param item - Schema for one row of the page.
 * @returns A struct schema carrying the page, metadata, and optional cursor.
 */
export const paginated = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    data: Schema.Array(item),
    meta: PaginationMeta,
    nextCursor: Schema.optional(Schema.NullOr(Schema.String))
  })

/**
 * Compute the pagination metadata for an offset window over `items` rows.
 *
 * `limit: -1` means "unlimited": a single page holds every row, matching the
 * legacy JSON API behavior.
 *
 * @param input - Window state and the echoed query fields.
 * @returns The pagination summary for the response.
 */
export function paginationMeta(input: {
  readonly items: number
  readonly page: number
  readonly limit: number
  readonly search: string
  readonly searchBy: string
  readonly order: string
  readonly orderBy: string
}): PaginationMeta {
  const { items, page, limit } = input

  if (limit === -1) {
    return {
      items,
      pages: 1,
      page,
      limit,
      from: items ? 1 : 0,
      to: items,
      hasNextPage: page < 1,
      hasPreviousPage: page > 1,
      search: input.search,
      searchBy: input.searchBy,
      order: input.order,
      orderBy: input.orderBy
    }
  }

  const pages = Math.ceil(items / limit)

  return {
    items,
    pages,
    page,
    limit,
    from: items ? (page - 1) * limit + 1 : 0,
    to: Math.min(page * limit, items),
    hasNextPage: page < pages,
    hasPreviousPage: page > 1,
    search: input.search,
    searchBy: input.searchBy,
    order: input.order,
    orderBy: input.orderBy
  }
}

/**
 * Compute the pagination metadata for a keyset window.
 *
 * Without a total count the summary describes the returned window: it is
 * always page one of the stream, `items` is the number of rows returned, and
 * `hasNextPage` echoes whether the response carries a continuation cursor.
 *
 * @param input - Window state and the echoed query fields.
 * @returns The pagination summary for the response.
 */
export function keysetMeta(input: {
  readonly items: number
  readonly limit: number
  readonly hasMore: boolean
  readonly search: string
  readonly searchBy: string
  readonly order: string
  readonly orderBy: string
}): PaginationMeta {
  const meta = paginationMeta({
    items: input.items,
    page: 1,
    limit: input.limit,
    search: input.search,
    searchBy: input.searchBy,
    order: input.order,
    orderBy: input.orderBy
  })

  return { ...meta, hasNextPage: input.hasMore, hasPreviousPage: false }
}

/**
 * Schema check rejecting a payload that supplies both a page and a cursor.
 *
 * @param payload - Decoded list payload.
 * @returns Failure output when both windows are present, `undefined` otherwise.
 */
export const onlyOneWindow = (payload: {
  readonly page?: number | undefined
  readonly cursor?: CursorPosition | undefined
}): Schema.FilterOutput =>
  payload.page !== undefined && payload.cursor !== undefined
    ? { path: ["cursor"], issue: "supply either page or cursor, not both" }
    : undefined

/**
 * Schema check rejecting a cursor that belongs to a different sort.
 *
 * @param cursor - Decoded cursor, when supplied.
 * @param sort - Sort configuration of the request.
 * @returns Failure output when the cursor does not match the sort, `undefined` otherwise.
 */
export const cursorMatchesSort = (
  cursor: CursorPosition | undefined,
  sort: { readonly orderBy: string; readonly order: "asc" | "desc" }
): Schema.FilterOutput => {
  if (cursor === undefined) return undefined

  if (cursor.orderBy !== sort.orderBy) {
    return { path: ["cursor"], issue: `cursor belongs to orderBy "${cursor.orderBy}", not "${sort.orderBy}"` }
  }

  if (cursor.direction !== sort.order) {
    return { path: ["cursor"], issue: `cursor belongs to order "${cursor.direction}", not "${sort.order}"` }
  }

  return undefined
}
