# `@lister/control-plane`

Browser control plane for the Lister market-data service: coverage and route
health for coins, exchanges, chains, and the crawler workers that keep the data
fresh. Vite + React 19 + Tailwind CSS v4, built on the shared `@lister/ui`
component package and the JSON API under `/api/*`.

## Development

The app needs the control-plane process for its API. Start both:

```sh
# Terminal 1: the API and SSR process (repo root, listens on :3001)
bun run start

# Terminal 2: the Vite dev server (http://localhost:5173)
cd apps/control-plane
bun run dev
```

The dev server proxies `/api` to `http://localhost:3001`, so the app resolves
the same API paths in development and production. Point the proxy elsewhere
with `CONTROL_PLANE_ORIGIN`:

```sh
CONTROL_PLANE_ORIGIN=http://localhost:4000 bun run dev
```

## Build and preview

```sh
cd apps/control-plane
bun run build     # emits dist/ (index.html, assets/, sourcemaps)
bun run preview   # serves dist/ on http://localhost:4173, proxying /api
```

In production the control-plane process serves `dist/` itself at the site root
with a single-page fallback, and content-hashed files under `/assets` with
immutable caching. Rebuild `dist/` whenever the app changes; the process picks
up new files without a restart.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONTROL_PLANE_ORIGIN` | `http://localhost:3001` | Dev/preview proxy target for `/api`. |

Runtime configuration is otherwise server-side (`packages/config`); the app
reads no environment variables at runtime.

## Routes

| Path | View |
| --- | --- |
| `/dashboard` | Coverage counts, blocked routes, thin coverage, worker summary |
| `/coins` | Listing stats with coverage filters and coin CRUD |
| `/coins/:id/routes` | Markets, chain links, and the transfer matrix for one coin |
| `/exchanges` | Exchange listing and CRUD |
| `/exchanges/:id` | Exchange identity and its market assignments |
| `/chains` | Chain listing and CRUD |
| `/chains/:id` | Chain identity and every market link that uses it |
| `/workers` | Worker state, shards, and start/stop controls |

Unknown client routes render the not-found view. The server returns the
application shell for any extension-less GET that accepts HTML, so deep links
and reloads work.

## Data access

All reads and writes go through the JSON API with the typed atom client in
`src/api/client.ts` (`AtomHttpApi` + `@effect/atom-react`). Query atoms are
keyed by their request payload and invalidated through reactivity keys
(`src/api/keys.ts`); mutations declare the keys they change
(`src/api/mutations.ts`). The searchable selects page through the API's keyset
cursors (`src/widgets/LookupSelect.tsx`).

## Typecheck and lint

```sh
bunx tsc --noEmit          # this app's tsconfig
bunx oxlint --type-aware   # from the repo root
```
