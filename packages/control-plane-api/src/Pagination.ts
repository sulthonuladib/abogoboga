import { Effect, Schema } from "effect"

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
 */
export const PaginationQueryFields = {
  page: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(1)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(1))
  ),
  limit: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(-1)),
    Schema.check(Schema.isLessThanOrEqualTo(100)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(10))
  ),
  search: Schema.String.pipe(
    Schema.check(Schema.isMaxLength(100)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("asc")))
} as const

/**
 * A `data` page plus its {@link PaginationMeta}.
 *
 * @template Item - Schema of a single row.
 * @param item - Schema for one row of the page.
 * @returns A struct schema carrying the page and its metadata.
 */
export const paginated = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    data: Schema.Array(item),
    meta: PaginationMeta
  })

/**
 * Compute the pagination metadata for a window over `items` rows.
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
