# Design

## Context

See `proposal.md` — Why. The constraints that shape this design:

- The repo is a **Bun workspace** (`packages/*`, `apps/*`, `apps/workers/*`),
  with `@lister/*` package names and `main: src/index.ts` entrypoints. No
  pnpm/Turbo. Any tooling that assumes those will not be used.
- The HTTP surface is an **Effect `HttpApi`** (`packages/control-plane-api/src/Api.ts`)
  mounted under `/api/*`, plus an SSR router (`apps/control-plane/src/web`)
  serving `/`, `/dashboard`, `/coins`, `/exchanges`, `/chains`, `/workers`,
  `/partials/*`, and `/static/*`.
- Root `tsconfig.json` uses a **custom JSX factory**
  (`jsxFactory: "Html.createElement"`) for the server-rendered views and only
  includes `.ts`. React workspaces need `jsx: react-jsx` and DOM types.
- List payloads share `PaginationQueryFields` (`packages/control-plane-api/src/Pagination.ts`):
  offset `page`, `limit ≤ 100`, single-field `searchBy`, `order`/`orderBy`, and a
  `PaginationMeta` response. Every list store repeats the same
  `select().where().orderBy().limit().offset()` shape.
- `searchBy` is a single literal field per list, and stores build
  `ilike(column, "%" + search.toLowerCase() + "%")`, so `%` and `_` in the query
  act as wildcards.
- `ChainStore` already has `findByCode`, and the `chain_code_unique` constraint
  is translated into `ChainCodeExists`, so idempotent create is reachable
  without a schema change.
- `CryptocurrencyListingStats.buildListingStats` is pure and in-memory: it loads
  every coin, market, and chain link and computes coverage, blocked routes, and
  the page window in JS.

## Goals / Non-Goals

**Goals:**

- One SPA served at `/` from the control-plane process, with client routing,
  deep links, and the same JSON API as its only data source.
- A shared component package reusable by other frontends in this monorepo via
  workspace imports, without a registry.
- Query capabilities the widgets need, additive to the existing API: keyset
  pagination, multi-field search, idempotent chain create, and SQL-side coin
  stats.
- A cutover path that removes SSR only after parity, keeping the process
  runnable at every step.

**Non-Goals:**

- shadcn registry distribution; Astro apps are consumers of `@lister/ui`, not
  part of this change.
- Replacing the JSON API with RPC/streaming. Live worker updates are deferred.
- Redesigning the domain schema; no new tables beyond what existing behavior
  needs.
- Removing `page`-based pagination from the API.

## Decisions

### Client/server split and transport

The SPA consumes the existing Effect `HttpApi` (`Api` in `packages/api`) as its
only data source. `AtomHttpApi.Service` (`effect/unstable/reactivity`) binds the
typed `HttpApiClient` to atoms, and components read them through the React hooks
in `@effect/atom-react` (`useAtomValue`, `useAtom`, `useAtomSet`, Suspense).
Query atoms are keyed by payload and mutations invalidate reactivity keys; cache,
TTL, and hydration come from the atom runtime. The server keeps only the API and
static file serving, and `/api/*` stays usable by non-browser clients. UI
controls (searchable select, tables, dialogs, toasts) are shadcn components from
`@lister/ui`.

Alternatives considered:

- **TanStack Query**: rejected — an external cache/state dependency that
  duplicates what `AtomHttpApi` already provides (query/mutation atoms,
  invalidation, TTL, hydration) and sits outside the Effect-native stack.
- **Effect RPC over HTTP or WebSocket** for all reads: rejected for this change —
  RPC over HTTP is supported and needs no codegen for TypeScript consumers
  sharing the group, but REST + OpenAPI stays the single contract for browser and
  non-browser clients, and a second surface would fork the API.
- **Server functions / SSR framework** (Next/Remix/Start): rejected — the
  process is already a Bun Effect server, and SSR is what we are retiring.
- **Hand-rolled fetch + `useState`**: rejected — infinite searchable dropdowns
  need request dedup, cancellation, and cache windows that the atom runtime
  already provides.

The paginated dropdown accumulates pages in a family atom; the pinned Effect RC
has no infinite-query helper, so page merging is application code.

Transport for live worker status is left as an open question; the initial app
can poll the existing worker endpoints.

### Package and app layout

```
packages/ui                     @lister/ui        shared shadcn/ui components + theme
packages/api                    @lister/api       renamed from packages/control-plane-api
apps/control-plane              @lister/control-plane   new Vite + React 19 SPA
apps/control-plane-api          @lister/control-plane-api  renamed from apps/control-plane
```

The rename removes the name collision between "the service library" and "the
app". `packages/control-plane-api` becomes `@lister/api` because it is the
service layer for the whole control plane; the server app takes the
`control-plane-api` name because it exposes the API and the assets.

Imports keep the subpath style the repo already uses (`@lister/api/...`), and
`@lister/ui` follows `packages/config`'s convention (`main: src/index.ts`,
`type: module`).

### Shared UI package with workspace reuse (no registry)

`packages/ui` is generated/initialized as a normal shadcn project (not
`shadcn init --monorepo`, which is pnpm + Turbo based and breaks on Bun). It
holds:

- `components.json` whose aliases point at in-package paths.
- `src/styles/globals.css` with Tailwind v4 `@import "tailwindcss"` and the
  preset's `@theme` tokens (style `luma`, base `mist`, chart/theme `rose`,
  `public-sans`, Phosphor icons).
- `src/components/**` (shadcn primitives), `src/lib/**` (cn, etc.),
  `src/hooks/**`.
- `package.json` exports: `"."`, `"./components/*"`, `"./lib/*"`,
  `"./hooks/*"`, `"./styles/*"` so consumers import `@lister/ui/components/...`.

Consumers add `@lister/ui: workspace:*` and extend (not replace) their Tailwind
build so they can theme components with their own tokens. This matches the
official `vite-monorepo` / `astro-monorepo` template direction: reuse over
distribution. A registry namespace can be layered on later without moving files.

### Per-app TypeScript and build isolation

Each React workspace owns a `tsconfig.json` with `jsx: "react-jsx"`, DOM libs,
and its own `include`. The root `tsconfig.json` excludes `packages/ui` and
`apps/control-plane` so the custom `Html.createElement` factory never sees
`.tsx`. The root `typecheck` script keeps checking server workspaces; the SPA
typechecks with its own config.

`apps/control-plane` builds with **Vite** to `apps/control-plane/dist`, with
`@vitejs/plugin-react` and `@tailwindcss/vite`. The dev server proxies `/api` to
the control-plane process so dev and prod resolve identical paths.

### Cursor pagination

Extend the shared pagination layer rather than each endpoint:

- `PaginationQueryFields` gains an optional `cursor` string; `page` stays.
- Decoded cursors carry the last row's sort key plus its `id` (a total-order
  tiebreak) so a page is `(orderBy, id) > (lastOrderBy, lastId)` in the active
  direction, rather than `OFFSET`.
- `PaginationMeta` (or a sibling field) gains `nextCursor: string | null`,
  computed only when a cursor page was requested. `page`-based responses keep
  their exact current shape.
- Stores implement cursor predicates for `(orderBy, id)` per table. The
  `limit: -1` unlimited mode is translated to a single large cursor page and
  reports `nextCursor: null`.

Alternative: continuing with `OFFSET` for stable sorts — rejected because
offsets drift under concurrent inserts and scale poorly, which is the reported
pain.

### Multi-field search

`searchBy` becomes a list of the capability's existing search fields (defaults
unchanged), and stores build `or(...fields.map(f => ilike(f, pattern)))`. The
pattern escapes `\`, `%`, and `_` before wrapping in `%…%`, so user text is
literal. Empty search skips the predicate entirely.

Alternative: free-text across every column — rejected as open-ended and
index-hostile; the UI knows which fields matter per control.

### Idempotent chain find-or-create

Add `POST /api/chain/find-or-create` (name per implementation) instead of
changing `POST /api/chain/add`. The handler inserts with
`on conflict (code) do nothing returning *`; when no row returns, it re-reads by
code and returns the existing chain. `add` keeps returning `ChainCodeExists` so
existing clients and tests are unaffected. This makes the concurrent case
correct: one insert wins, the loser falls through to the read.

Alternative: making `add` idempotent — rejected: it silently changes an
observable error contract (`ChainCodeExists` on `add`).

### SQL-side coin listing stats

Replace the load-everything `buildListingStats` with a store query:

- Filter coins by search/flag/exchange/chain and sort in SQL.
- Aggregate `markets` (market rows per coin), `chains` (distinct chain ids via
  market → chain link), and `blocked` from the filtered set.
- Page with the same keyset predicate as other lists.

The `blocked` count is the hard part: it is a pairwise "no shared enabled chain
in either direction" count over a coin's markets. It is expressed as a
self-join/aggregate over the coin's chain links so the database does the work.
If the query proves unwieldy, the fallback is to keep `blocked` as a correlated
subquery while still filtering and paging in SQL — the response shape is
unchanged, so the spec holds either way.

Alternative: keep the in-memory computation and only page the output —
rejected: it still materializes every coin, market, and link, so it remains the
scaling blocker.

### SSR retirement

`WebRoutes` is replaced, at parity, by:

- a static server for `apps/control-plane/dist/assets` under `/assets`, and
- a catch-all that returns `dist/index.html` for non-`/api/*`, non-asset GETs.

Then delete `apps/control-plane-api/src/web/**`, the web test suite,
`docs/frontend-hateoas.md`, `public/static/*`, the `daisyui` dependency, and the
`css:build`/`css:watch` scripts. The API groups and their paths are untouched,
so `/api/*` behavior is preserved by construction.

## Risks / Trade-offs

- **React 19 + Base UI RC / shadcn CLI workspace resolution** → pin the preset
  packages, initialize `packages/ui` standalone, and keep consumers importing
  subpaths rather than re-running `init` inside apps.
- **Root custom JSX factory bleeding into `.tsx`** → root `tsconfig.json`
  `exclude` plus per-app tsconfigs; verify with `bunx tsc --noEmit` before and
  after adding the apps.
- **Cursor drift on mutable sort keys** → include `id` as a total-order
  tiebreak and document that paging is only stable across requests with
  unchanged sort configuration.
- **`limit: -1` (legacy unlimited) vs cursor** → define unlimited as one page
  with `nextCursor: null`; existing unlimited callers are unchanged.
- **SQL `blocked` count correctness/perf** → keep the in-memory implementation
  as a test oracle and compare counts in tests before deleting it.
- **Dev/prod path drift** → single Vite proxy config for `/api`; production
  static + catch-all handler tested against built output.
- **Rename churn (15 import sites)** → do the two renames as one mechanical
  commit with no behavior change, verified by `bun test` and `tsc`, before any
  new app work.
- **Long-lived `page` and `cursor` in one contract** → keep `page` as the
  compatibility path and only add `nextCursor` for cursor requests, so no
  existing response shape changes.

## Migration Plan

1. **Rename** `packages/control-plane-api` → `packages/api` (`@lister/api`) and
   `apps/control-plane` → `apps/control-plane-api` (`@lister/control-plane-api`);
   update the 15 import sites and root `package.json`/`tsconfig.json` paths.
   Re-run tests and typecheck. No behavior change.
2. **Create `packages/ui`** with the preset theme and base components; verify a
   throwaway consumer import compiles and styles.
3. **Create `apps/control-plane`** SPA: build the first widget (searchable,
   paginated exchange/chain select; instant chain add) against the current API,
   then the remaining pages.
4. **API deltas**: cursor pagination, multi-field search, find-or-create, and
   SQL-side stats — additive, with the existing tests kept green and the
   in-memory stats used as an oracle.
5. **Cut over**: serve `dist` and the SPA fallback from the control-plane
   process; delete the SSR tree, assets, `daisyui`, and `css:*` scripts.

Rollback: steps 1–4 are additive and independently revertable; the SSR router
stays in the process until step 5, so reverting step 5 restores the old
frontend without touching the API.

## Open Questions

- Live worker status transport (polling vs SSE vs RPC) — the app works against
  current polling endpoints until decided; does not change the specs.
- Whether `page` is eventually deprecated in favor of `cursor` — deferred; both
  remain supported in this change.
- Whether `packages/ui` should later publish a registry namespace — deferred;
  workspace reuse is sufficient now.