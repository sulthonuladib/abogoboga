# Spec Delta

## Purpose

Defines the REST query surface the browser control plane relies on to browse
coins, exchanges, chains, markets, and chain links — keyset pagination,
multi-field search, idempotent chain find-or-create, and server-side listing
stats for coins.

## ADDED Requirements

### Requirement: Cursor pagination on list endpoints

List endpoints under `/api/*` SHALL accept an optional opaque `cursor` in place
of `page`, and SHALL return a `nextCursor` that is `null` when the page is the
last one. A request that supplies neither `page` nor `cursor` MUST behave as the
first page. Existing `page`-based requests MUST keep their current response
shape so existing clients are unaffected.

#### Scenario: First page returns a cursor

- **WHEN** a client posts a list payload with a `limit` and no `cursor`
- **THEN** the response includes the first `limit` rows ordered by the requested sort and a non-null `nextCursor` when more rows exist, or `null` when the page is the last

#### Scenario: Following the cursor returns the next window

- **WHEN** a client posts the same list payload with the `nextCursor` from the previous response
- **THEN** the response continues after the last row of the previous page with no duplicated or skipped rows, and echoes the new `nextCursor`

#### Scenario: Page-based request is unchanged

- **WHEN** a client posts a list payload with `page` and no `cursor`
- **THEN** the response uses the existing pagination metadata (`items`, `pages`, `page`, `limit`, `from`, `to`, `hasNextPage`, `hasPreviousPage`)

#### Scenario: Cursor past the end returns an empty page

- **WHEN** a client posts a `cursor` that points past the last row
- **THEN** the response returns an empty `data` array and `nextCursor` is `null`

### Requirement: Multi-field search for lookup endpoints

List endpoints used to populate selection controls SHALL accept a `searchBy`
value naming one or more searchable fields, and SHALL match the search text
against any of those fields. Search MUST be case-insensitive and MUST treat `%`
and `_` in the input as literal characters rather than wildcards.

#### Scenario: Chain lookup matches name or code

- **WHEN** a client posts a chain list payload with text search and `searchBy` covering `name` and `code`
- **THEN** the response includes chains whose name or code matches the search text

#### Scenario: Exchange lookup matches multiple fields

- **WHEN** a client posts an exchange list payload with text search and `searchBy` covering `name` and `slug`
- **THEN** the response includes exchanges matching on any requested field

#### Scenario: Wildcard characters are matched literally

- **WHEN** a client searches for text containing `%` or `_`
- **THEN** only rows containing those literal characters are returned

#### Scenario: Empty search returns all rows

- **WHEN** a client posts a list payload with an empty search string
- **THEN** the response is the unfiltered first page for the requested sort

### Requirement: Idempotent chain find-or-create

The chain API SHALL expose an idempotent create operation that returns the
existing chain when a chain with the same code already exists, instead of
failing with a conflict. The returned payload MUST be indistinguishable from the
existing chain's representation.

#### Scenario: New code creates a chain

- **WHEN** a client submits a chain code that does not exist
- **THEN** the response contains the newly created chain

#### Scenario: Existing code returns the existing chain

- **WHEN** a client submits a chain code that already exists
- **THEN** the response contains the existing chain with its original identifier and no new row is created

#### Scenario: Inline creation during assignment succeeds once

- **WHEN** two concurrent requests submit the same new chain code
- **THEN** exactly one chain exists afterwards and both responses identify the same chain

### Requirement: Server-side listing stats for coins

The coin listing-stats endpoint SHALL apply the search, flag, exchange, and
chain filters, the requested sort, and the page window as part of the query
rather than by loading every coin, market, and chain link and filtering in
memory. The response MUST report counts and totals computed over the filtered
set.

#### Scenario: Filtering happens before paging

- **WHEN** a client requests stats with an exchange filter and a page window
- **THEN** the returned `data` contains only coins listing that exchange and the metadata totals describe the filtered set rather than all coins

#### Scenario: Sort applies to the full filtered set

- **WHEN** a client requests stats sorted by a coverage count
- **THEN** ordering reflects every matching coin, not just the rows in the returned window

#### Scenario: Cursor paging over stats

- **WHEN** a client pages stats with a cursor
- **THEN** each page continues from the previous window with no row returned twice

#### Scenario: Coverage counts stay accurate

- **WHEN** stats are returned for a coin
- **THEN** its `markets`, `chains`, and `blocked` counts match the coin's actual assignments and enabled transfer routes