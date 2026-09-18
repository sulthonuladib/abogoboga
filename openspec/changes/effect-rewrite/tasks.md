# Tasks

## 1. Monorepo scaffold

- [x] 1.1 Add `workspaces: ["packages/*", "apps/*"]` to root `package.json`, extend root `tsconfig.json` includes to `packages/*/src` and `apps/*/src`, and verify `bun install` plus `bunx tsc --noEmit` still pass
- [x] 1.2 Create workspace package skeletons (`packages/config`, `packages/observability`, `packages/domain`, `packages/db`, `packages/control-plane-api`, `packages/crawler`, `packages/worker-contract`) each with `package.json` (`@lister/*` name, `effect` dep pinned to the root version) and `src/index.ts`, and verify `bun install` resolves all workspace names
- [x] 1.3 Upgrade `drizzle-orm`/`drizzle-kit` to the RC line, run `drizzle-kit generate`, review the SQL diff for table-definition breakage, and verify `bunx tsc --noEmit` passes with no table changes except RC-required syntax

## 2. Config and observability foundation

- [x] 2.1 Implement `packages/config` `AppConfig` service (`databaseUrl: Redacted`, `port`, service identity) preserving local-dev default and production-required `DATABASE_URL`, with JSDoc on all exports, and verify `bun test packages/config` covers default/explicit/production-missing cases
- [x] 2.2 Implement `packages/observability` `LoggerLive` (pretty dev / JSON prod) plus `Otlp.layerFromConfig` merge (logs+traces+metrics), provided-last documented, and verify `bun test packages/observability` builds the layer with no collector and with `OTEL_SDK_DISABLED=1`
- [x] 2.3 Remove top-level side effects from config/connection paths (`src/config.ts` throw-helpers contained at the boundary), and verify `bunx oxlint --type-aware` is clean on the new packages

## 3. Domain and worker-protocol Schemas

- [x] 3.1 Implement `packages/domain` branded IDs and `Model.Class` domain models for exchange, cryptocurrency, market, chain link, and chain (DB + JSON variants from one declaration), and verify roundtrip tests pass under `bun test packages/domain`
- [x] 3.2 Implement `packages/worker-contract` Schemas (`BootstrapCoin`, `CanonicalTick`, `WorkerCommand`, bootstrap `SYMBOL:cmcId` string codec) preserving the current wire format with strict `Int` `cmcId`, and verify `bun test packages/worker-contract` covers valid lines, malformed-line rejection, and bootstrap roundtrips
- [x] 3.3 Define `WorkerRpc` `RpcGroup` (`Subscribe`, `Unsubscribe`, `Ticks` stream, `Health`) in `packages/worker-contract` without binding a transport, and verify `RpcTest` loopback covers all four RPCs

## 4. Database service

- [x] 4.1 Implement `packages/db` `Database` service via `PgDrizzle.makeWithDefaults()` over `PgClient.layerConfig`, running `PgMigrator` on layer build, deleting the `new Bun.SQL()` import-time singleton, and verify layer builds against the Compose Postgres
- [x] 4.2 Move existing `*.sql.ts` table definitions into `packages/db` (re-exported), update `drizzle.config.ts` schema paths, and verify `drizzle-kit generate` produces an empty diff plus `bunx tsc --noEmit` passes
- [x] 4.3 Add `Database.layerMemory` (or documented reason a substitute is impossible) for repository tests, and verify at least one existing DB-backed test runs through the new layer

## 5. JSON CRUD API

- [x] 5.1 Define `packages/control-plane-api` root `HttpApi` with the `cryptocurrency` group (list with extended filters/pagination, stats, metadata, add, findById, update, remove) and stable error codes, and verify `HttpApiTest` covers the full lifecycle plus the 409 duplicate-`cmcId` case
- [x] 5.2 Implement `Cryptocurrency` Application Service + narrow ports on the `Database` service with `Schema.TaggedError` errors, and verify service tests through `layerMemory` without HTTP
- [x] 5.3 Port `exchange`, `chain`, market-assignment, and chain-link groups with their handlers, and verify `HttpApiTest` covers each group's list/get/mutate paths
- [x] 5.4 Serve `/openapi.json` + `/docs` (Scalar) from the API definitions and verify every endpoint from 5.1/5.3 appears in the generated document

## 6. SSR web UI

- [x] 6.1 Implement `apps/control-plane` `HttpRouter` HTML routes for `/dashboard`, `/coins`, `/exchanges`, `/chains` reusing the Phase-5 services, with full-vs-fragment branching and OOB toast/modal behavior, and verify `bun test` fragment assertions pass per page
- [x] 6.2 Implement drawer, routes-matrix, detail, option-search, and `/not-found` partials with delete guards and `HX-Redirect` semantics, and verify each partial has a route-level test
- [x] 6.3 Remove `@elysiajs/html` JSX views once all routes are implemented, and verify `bunx oxlint --type-aware` and `bunx tsc --noEmit` pass with the dependency uninstalled

## 7. Crawler supervision as Effect services

- [x] 7.1 Implement the `Supervisor` Effect service (`FiberMap` shards, `Scope`-bound `ChildProcessSpawner.spawn`, `Stream` tick decode, `Schedule` backoff respawn, boot sweep) preserving current observable behavior, and verify `bun test` covers crash-respawn, clean-exit drop, stop-cancels-respawn, and boot-sweep cases
- [x] 7.2 Implement the `Reconciler` Effect fiber plus `DomainEvents` PubSub (replacing `MemoryPublisher` and the global desired-state `Set`), recomputing eligibility from DB truth on every event, and verify add/remove-converge tests through the public interface
- [x] 7.3 Port the tick pipeline (`processTick`, quote conversion, snapshot upsert) with `TestClock`-deterministic tests and `annotateLogs({exchange, shard})` spans, and verify thin-book skip plus quote-math tests pass

## 8. Worker apps and control plane

- [ ] 8.1 Move `src/crawl-workers/subprocesses/*` to `apps/workers/<exchange>` as thin `BunRuntime.runMain` entrypoints on the `worker-contract` Schemas (no behavior change), and verify the dummy worker boot/subscribe/unsubscribe flow still passes its tests
- [x] 8.2 Implement the `workers` HttpApi group (start, stop, status, SSE events stream) backed by the Supervisor, enforcing conflict-on-duplicate semantics with no event emission on rejection, and verify `HttpApiTest` covers start/stop/conflict/404/status
- [x] 8.3 Build the `/workers` monitoring page (exchange badges, start/stop buttons, shard/restart detail, 2s HTMX polling, SSE tail) and verify status polling and event-stream delivery against a live supervisor

## 9. CLI and cutover

- [ ] 9.1 Implement the Effect CLI (`seed`, `migrate`, `sweep`) replacing `src/seed/*` scripts, and verify each subcommand runs against Compose Postgres
- [ ] 9.2 Delete oRPC routers, Elysia app, `src/queues/*`, old supervisor/reconciler, the `tests/**` suites that cover them, and `zod`/`drizzle-zod`/`ws`/`amqplib` dependencies, and verify `bun test tests packages`, `bunx tsc --noEmit`, and `bunx oxlint --type-aware` are fully green
- [ ] 9.3 Wire the single composition root (`Layer.launch` of API + SSR + supervisor + reconciler, OTLP provided last, `BunRuntime.runMain`), boot against Compose Postgres with no collector, and verify health, one CRUD flow, worker start/stop, and JSON log output end to end
- [ ] 9.4 Delete the remaining legacy implementation under `src/**` (web UI, core modules, database connection, config helpers) and any remaining tests that cover it, once every capability is ported, and verify `bun test tests packages`, `bunx tsc --noEmit`, and `bunx oxlint --type-aware` are green with the legacy tree removed

## 10. Handoff verification

- [ ] 10.1 Run the full gate (`bun test tests packages`, `bunx tsc --noEmit`, `bunx oxlint --type-aware`, OpenAPI completeness check) and record any failures as follow-up tasks instead of leaving them implicit
- [ ] 10.2 Run `openspec validate` for the change and resolve every reported problem, then request review before any apply workflow starts
