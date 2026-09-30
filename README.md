# Lister

Cryptocurrency, exchange, network, and metadata API. Control-plane service for market-data coverage: coins, exchanges, chains, markets, and the crawler workers that keep the data fresh.

Stack: Bun + TypeScript + Effect, Postgres + Drizzle ORM, Foldkit frontend.

## Layout

- `apps/control-plane-api/` — HTTP server: JSON API under `/api/*`, OpenAPI docs, and the event socket. Entrypoint `src/index.ts`, composition root `src/Main.ts`.
- `apps/folding-plane/` — the Foldkit frontend (server-rendered) and the sole browser entry. See `apps/folding-plane/FOLDKIT.md` and `apps/folding-plane/AGENTS.md`.
- `apps/cli/` — `lister` operations CLI: `scan fetch|import`, `seed tester`, `migrate`.
- `apps/workers/<exchange>/` — per-exchange crawler workers (binance, bybit, indodax, kucoin, …) supervised by the control plane. `dummy` is the fallback.
- `packages/` — `api` (HttpApi definition + handlers), `domain`, `db` (Drizzle schema), `config` (`AppConfig`), `crawler` (supervisor/reconciler), `worker-contract`, `observability`, `generated`.
- `drizzle/` — generated migrations. `repos/` — read-only vendored Effect + Foldkit source. `openspec/` — specs and change proposals.

## Prerequisites

- Bun (see `bun.lock` / `bunfig.toml`)
- Docker (for local Postgres) or a reachable Postgres 16 instance

## Quickstart

```sh
cp .env.example .env        # optional; defaults match docker-compose.yml
docker compose up -d postgres
bun install
bun run db:push             # or: bun run db:migrate
bun run start               # API on :3001
```

Seed tester data and CoinGecko metadata:

```sh
bun run db:seed:tester
bun run scan:fetch          # needs COINGECKO_DEMO_API_KEY for higher rate limits
bun run scan:import
```

Browser app (folding-plane, the sole browser entry):

```sh
bun run dev:web             # folding-plane dev server
bun run build:web           # folding-plane production build
bun run --cwd apps/folding-plane start   # production host on :3000, proxies /api to :3001
```

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` / `bun run start` | API with `--watch` / plain |
| `bun run dev:web` / `bun run build:web` | folding-plane dev / build |
| `bun test --isolate ./packages ./apps` (`bun run test`) | unit tests |
| `bunx tsc --noEmit` | typecheck |
| `bunx oxlint --type-aware ./packages ./apps ./tools` | lint |
| `bun run db:push\|generate\|migrate` | drizzle-kit schema push / generate / migrate |
| `bun run db:seed:tester`, `scan:fetch`, `scan:import` | CLI shortcuts |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://abogoboga:abogoboga@localhost:5432/abogoboga` (dev/test only; required in production) | Postgres connection |
| `DATABASE_URL_TEST` | — | test database |
| `PORT` | `3001` | API listen port |
| `SERVICE_NAME` / `NODE_ENV` | `control-plane` / `development` | identity, env |
| `CORS_ORIGINS` | allow-all in dev | browser origins |
| `COINGECKO_DEMO_API_KEY` | — | higher CoinGecko rate limit for `scan fetch` |
| `PORT` / `ORIGIN` (folding-plane) | — | folding-plane serve port / public origin |

## API

JSON API lives under `/api/*` with an OpenAPI document served by the API process (`apiDocsLayer` in `packages/api`). The folding-plane frontend uses `apps/folding-plane/src/api/` — the only module that talks to the API.

## Notes for agents

- Read `AGENTS.md` (vendored `repos/` are read-only reference; never import from them) and `repos/effect/LLMS.md` before writing Effect code.
- Folding-plane conventions live in `apps/folding-plane/AGENTS.md` + `FOLDKIT.md`.
- Drizzle tooling runs outside Effect: `drizzle.config.ts` reads `DATABASE_URL` directly; keep its default in sync with `localDatabaseUrl` in `packages/config/src/AppConfig.ts`.
