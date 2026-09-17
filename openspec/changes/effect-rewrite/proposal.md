# Proposal

## Why

The codebase runs its API on oRPC+Elysia+Zod with a global Drizzle singleton, `process.env` read at import time, a `MemoryPublisher` queue, and a hand-rolled `Bun.spawn` supervisor with `setTimeout` respawn. There is no typed error channel, no test seam below the HTTP boundary, no structured observability, and no module boundary that would allow a future microservice split. Rewriting on Effect v4 RC gives typed errors, Layer-based composition with honest test doubles, and a monorepo layout where each deployable unit is already a package.

## What Changes

- **BREAKING**: Remove `@orpc/*`, `elysia`, `@elysiajs/*`, `elysia-htmx`, `zod`, `drizzle-zod`, `ws`, `amqplib`. JSON CRUD is served by Effect `HttpApi`; SSR pages by Effect `HttpRouter`.
- Restructure the repo as Bun workspaces: `packages/*` (libraries) + `apps/*` (entrypoints `control-plane`, `workers/<exchange>`).
- Keep Drizzle as the persistence mapper, upgraded to the RC line for the `drizzle-orm/effect-postgres` adapter over `@effect/sql-pg`.
- Keep the HTMX SSR UI (pages, fragments, OOB behavior) rendered as HTML strings from shared Application Services; the UI ships with the rewrite, so exact legacy URL parity is not required.
- Promote worker start/stop to a real control plane: activator/deactivator plus live status and an SSE event stream.
- Rewrite the crawler supervisor on Effect primitives (`FiberMap`, `Scope`, `Stream`, `Schedule`, `PubSub`); keep the JSONL-over-stdio subprocess contract with a strict Schema definition.
- Add OTLP export (logs/traces/metrics, no-op without a collector) and environment-gated JSON logging.
- Exchange worker internals under `apps/workers/*` are restructured only; reimplementation stays with the owner.

## Capabilities

### New Capabilities

- `json-crud-api`: Schema-first JSON CRUD over exchanges, cryptocurrencies, markets, chain links, and chains, with extended filters, pagination, and stable error codes.
- `ssr-web-ui`: HTMX-driven server-rendered pages and partials (dashboard, coins, exchanges, chains, routes matrix, drawers, toasts) with stable page and fragment URLs; exact legacy URL parity is not required.
- `worker-control-plane`: Worker activator/deactivator plus monitoring: per-exchange status, shard detail, and a live event stream.
- `crawler-supervision`: Sharded subprocess supervision with backoff respawn, DB-truth reconciliation, and tick ingestion into orderbook snapshots.
- `worker-protocol`: Parent/subprocess wire contract: argv bootstrap, stdin commands, stdout ticks, stderr logs.
- `observability`: Structured logging, log-level gating, and OTLP export for logs, traces, and metrics.

### Modified Capabilities

None. No `openspec/specs/` exist and no current REST/RPC behavior contract is being altered except through the new capabilities above (error codes are re-expressed, not changed in meaning).

## Impact

- Code: `src/router.ts`, `src/index.ts`, all `*.router.ts`, `src/web/*`, `src/queues/*`, `src/core/crawler/*`, `src/database/*` are replaced in phases; `src/crawl-workers/subprocesses/*` move to `apps/workers/*`.
- Dependencies: add `@effect/sql-pg`, `@effect/platform-bun` (already installed at rc.115); upgrade `drizzle-orm`/`drizzle-kit` to the RC line; drop the oRPC/Elysia/Zod/WS/AMQP set.
- Systems: Postgres stays (same migrations content, new runner); optional OTLP collector; `DATABASE_URL`, `PORT`, `NODE_ENV`, standard `OTEL_*` env configuration.
