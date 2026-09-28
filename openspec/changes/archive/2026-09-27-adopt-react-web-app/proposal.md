# Proposal

## Why

The control plane's operator UI is server-rendered htmx inside the Bun/Effect
process (`apps/control-plane/src/web`): every interaction is a full fragment
round-trip, filter dropdowns are preloaded snapshots, and option pickers are
capped at a top-10 with no paging. The three interactions the operators need
most — searching a dropdown with paginated results, appending more results as
the list scrolls, and creating a chain inline while assigning one — are either
awkward or impossible under that model. At the same time `/coins` computes its
filtered, sorted, and paginated listing stats in memory from every coin, market,
and chain link, which does not scale and blocks any real keyset paging.

Rather than keep extending the SSR layer, we adopt a real client application and
move the listing query work into the API where it can be paginated and indexed.

## What Changes

- Introduce one browser application for the control plane, built with Vite +
  React 19 + Tailwind CSS v4, served by the existing Bun/Effect process at `/`.
  The JSON API stays under `/api/*` and is unchanged in path.
- Introduce a shared, shadcn/ui-based component package so additional frontends
  added to this monorepo later (e.g. Astro app, docs site) can reuse the same
  components through workspace imports. Registry distribution is **out of scope**
  for this change.
- **BREAKING**: rename the application service library `@lister/control-plane-api`
  (dir `packages/control-plane-api`) to `@lister/api` (dir `packages/api`).
- **BREAKING**: rename the Effect server app `@lister/control-plane`
  (dir `apps/control-plane`) to `@lister/control-plane-api`
  (dir `apps/control-plane-api`), freeing the `apps/control-plane` path and
  `@lister/control-plane` name for the new browser app.
- Add API capabilities the new UI depends on: cursor (keyset) pagination,
  multi-field search for dropdown queries, idempotent find-or-create for chains,
  and server-side listing stats for coins (filter/sort/page pushed into SQL
  instead of computed in memory).
- **BREAKING**: retire the server-rendered htmx frontend once the new app
  reaches parity — remove `apps/control-plane-api/src/web`,
  `docs/frontend-hateoas.md`, the `public/static` htmx/CSS assets, the `daisyui`
  dependency, and the `css:build` / `css:watch` scripts. This removal happens
  only after the new application covers the existing pages.

## Capabilities

### New Capabilities

- `control-plane-web-app`: The browser control plane served by the
  control-plane process — a single-page application mounted at `/`, consuming
  the JSON API under `/api/*`, with its own client routing and static asset
  serving, replacing the server-rendered htmx UI.
- `control-plane-query-api`: The REST query surface for browsing coins,
  exchanges, chains, and nested listings — keyset (cursor) pagination,
  multi-field search, idempotent chain find-or-create, and server-side
  listing-stats computation for coins.

### Modified Capabilities

<!-- none: `openspec list --specs` shows only crawler-supervision and
     crawler-worker-contract, neither of which this change alters. -->

## Impact

- **New packages**: `packages/ui` (`@lister/ui`) — shared shadcn/ui components,
  Tailwind v4 theme, hooks, and utilities, configured for shadcn monorepo
  workspace reuse.
- **New apps**: `apps/control-plane` (`@lister/control-plane`) — Vite + React 19
  single-page app; build output `dist/`.
- **Renamed**: `packages/control-plane-api` → `packages/api` (`@lister/api`,
  15 import sites across apps/packages); `apps/control-plane` →
  `apps/control-plane-api` (`@lister/control-plane-api`). Root `package.json`
  `module`, `dev`, and `start` paths updated; root `tsconfig.json` include
  extended for `.tsx` and scoped with `exclude` so the custom server-side JSX
  factory does not apply to the React workspaces.
- **API**: `packages/api` list payloads gain optional cursors and multi-field
  search; `Chain` gains an idempotent find-or-create; `CryptocurrencyListingStats`
  moves filtering/sorting/slicing into the store. Store ports
  (`ChainStore`, `ExchangeStore`, `CryptocurrencyStore`) gain cursor support.
- **Removed** (after parity): `apps/control-plane-api/src/web/**`,
  `docs/frontend-hateoas.md`, `public/static/{app.css,htmx.min.js}`, `daisyui`
  dependency, `css:build` and `css:watch` scripts, and the SSR route tests
  (`Pages.test.ts`, `Partials.test.ts`, `Mutations.test.ts`, `Workers.test.ts`,
  `Static.test.ts`).
- **Dependencies**: adds `react`, `react-dom`, `vite`, `@vitejs/plugin-react`,
  `@tailwindcss/vite`, `@effect/atom-react` (rc matching the pinned
  `effect@^4.0.0-rc.117`), shadcn/ui runtime (Base UI) plus the preset's font and
  icon packages; `tailwindcss@4` already present.
- **Unchanged**: `@lister/domain`, `@lister/db`, `@lister/crawler`,
  `@lister/worker-contract`, `@lister/config`, `@lister/observability`,
  workers, and every `/api/*` path and payload that does not gain an optional
  field.