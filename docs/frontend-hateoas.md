# Frontend HATEOAS Guide

Server-driven web UI: every action is discovered from the last HTML response.
Do not hardcode partial URLs. Follow `hx-*` attributes, links, and redirects.

## Shell vs fragment

- Full page loads (`GET /dashboard`, `/coins`, `/exchanges`, `/chains`,
  `/coins/:id/routes`, `/not-found`) render `Layout` with:
  - Daisy `drawer` sidebar (`#app-nav-toggle`, `lg:drawer-open`) + `navbar`
    (`navbar-start`: sidebar toggle + brand, `navbar-center`: `#navbar-crumbs`,
    `navbar-end`: Refresh + API docs)
  - `<main id="main-content">`, plus `<div id="drawer-slot">`,
    `<div id="modal-slot">`, `<div id="toasts">`
- htmx navigation (`HX-Request: true`, not history-restore) returns a fragment
  without a second shell, targeting one of the ids below.
- All fragment responses set `Vary: HX-Request`. Do not cache across
  fragment/full variants.

## Fragment targets (discover from responses, not from memory)

- `#main-content` — page bodies (`DashboardBody`, `CoinsPageBody`,
  `ExchangesPageBody`, `ChainsPageBody`, `RoutesMatrixBody`, `NotFoundBody`).
  Nav links use `hx-get`, `hx-target="#main-content"`, `hx-push-url="true"`.
- `#coins-table-wrap`, `#exchanges-table-wrap`, `#chains-table-wrap` —
  listing tables with single count badges `#coins-count`, `#exchanges-count`,
  `#chains-count`. Filter forms (`#coins-filter`, `#exchanges-filter`,
  `#chains-filter`) `hx-get` their partial (`/partials/coins`,
  `/partials/exchanges`, `/partials/chains`) with
  `input changed delay + change`, `hx-include` for paging/sort.
- `#drawer-slot` / `#drawer-body` — coin overlay drawer
  (`#coin-drawer-toggle`, `drawer-end`). Open via
  `hx-get="/partials/coins/:id/drawer"` → `#drawer-slot`.
  Market / chain-link mutations target `#drawer-body` `outerHTML`.
  `View transfer routes` navigates to `#main-content` and the server clears
  `#drawer-slot` out-of-band.
- `#modal-slot` / `#app-modal` — native `<dialog open>` for create/edit.
  Close via `<form method="dialog">` close button, backdrop
  `<form method="dialog" class="modal-backdrop">`, Cancel via
  `formmethod="dialog"`, or Escape. No JS clearing.
- `#toasts` — `ToastOob` appends `beforeend`. Auto-fades via CSS
  (`toast-fade` 4.5s), no timer JS.
- `#*-error` (`#coins-error`, `#exchanges-error`, `#chains-error`,
  `#drawer-error`) — inline form/validation errors. Assignment conflicts and
  missing references re-render `#drawer-body` with field-level messages and
  retained input, not bare fragments.

## Pagination, search, sort (server-side only)

- Listings: `GET /exchanges?q&page`, `GET /chains?q&page` (20/page),
  `GET /coins` with `q, sortBy, order, flag, exchangeId, chainId`.
  Fragments: `/partials/exchanges?page&q`, `/partials/chains?page&q`,
  `/partials/coins?page + filter`.
- Each table wrap shows total count, `Page X of N`, Prev/Next carrying the
  current filter via `hx-include="#*-filter"`.
- No client-side filtering. Search/paging always issues a request.
- Assignment options (never preload full tables):
  - `GET /partials/exchanges/options?q&page&target&select&selected` (20/page)
  - `GET /partials/chains/options?q&page&target&select&selected` (20/page)
  - Forms start with first 20 (or current selection only), fetch on
    `input changed delay:300ms + change`. Paging buttons swap `outerHTML` on
    `#{target}`. Empty option result states “no matches” with a clear-search
    control.

## Redirects (follow, don’t construct)

- Unknown routes: last-registered `GET /*` bypasses `/api/*`, `/static/*`,
  `/openapi.json`, `/docs`, then:
  - full load → `302` to `/not-found?from=<original-path>`
  - htmx → `HX-Redirect: /not-found?from=<original-path>`
- Missing entities: `NaN` ids and caught `ORPCError NOT_FOUND` redirect with
  context, preserving `kind`:
  - `coin` (`/coins/:id/*`, drawer, routes), `exchange` (`/exchanges/:id*`),
    `chain` (`/chains/:id*`), `market` (`/partials/markets/:id*`),
    `chain-link` (`/partials/chain-links/:id*`), `route`
    (`/partials/coins/:id/routes/detail` bad `from/to` → `kind=route`).
  - full load → `302` to `/not-found?kind=…&id=…`
  - htmx → `HX-Redirect` there.
- `GET /not-found?from&kind&id` renders `NotFoundBody` inside `Layout` with
  status `404`, never redirects. Offers Dashboard + back (`from` if safe,
  else Coins).
- Mutations keep inline form errors; only parent-gone (coin/market deleted
  elsewhere) redirects.

## No-hardcoded-partials rule

- Build URLs only from `hx-get/post/delete`, `<a href>`, or `HX-Redirect`.
- Never invent `/partials/*`. If a control isn’t in the last response,
  `GET` its page (`/coins`, `/exchanges`, `/chains`, `/dashboard`) and follow
  the returned controls.
- Count badges: one id per listing (`#coins-count`, etc.). Creates replace
  the table wrap (`outerHTML`, count included); deletes remove the row
  (`closest tr`) + out-of-band `<span id="*-count" hx-swap-oob="true">`.
  `PageHeader` never uses a second `#page-count`; it reuses the listing id
  via `countId` when a header count is shown.

## Walkthroughs (guide + live responses only)

1. List: `GET /coins` → `#coins-table-wrap` → sort buttons
   (`/partials/coins?sortBy=&order=` + `hx-include="#coins-filter"`).
2. Paginate: `GET /partials/exchanges?page=2` → `Page 2 of N`, total count.
   Search: `GET /partials/exchanges?q=bin` → narrowed rows + updated total.
3. Assign: open drawer (`/partials/coins/:id/drawer`) →
   `#exchange-assign-options` search `q` → `POST /partials/coins/:id/markets`
   → duplicate redisplays `#drawer-body` with message + retained values.
   Chain link: per-market `#chain-options-<marketId>` →
   `POST /partials/markets/:id/chains`.
4. Not-found: `GET /does-not-exist` → `302` → `/not-found?from=/does-not-exist`
   (404 + Dashboard/back). htmx same path → `HX-Redirect` there.
   `GET /exchanges/abc` → `/not-found?kind=exchange&id=abc`.
   `GET /coins/999999/routes` (missing) → `/not-found?kind=coin&id=999999`.
