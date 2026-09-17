# Design

## Context

See proposal.md for motivation. Current state: oRPC+Elysia JSON API, Elysia+JSX HTMX SSR, global `Bun.SQL`/Drizzle singleton with `process.env` read at import time, `MemoryPublisher` queue, class-based `Supervisor` on `Bun.spawn` with `setTimeout` respawn, and 13 legacy `src/crawl-workers/subprocesses/*` workers not yet on the contract. Pinned stack: `effect@4.0.0-rc.115` (+ `@effect/sql-pg`, `@effect/platform-bun`), Bun runtime, Postgres via Docker Compose. Reference implementation: `~/personal/opencode` (`effect@beta`, `drizzle-orm@1.0.0-rc.2`, HttpApi protocol/server split, vendored Drizzle-Effect adapter).

## Goals / Non-Goals

**Goals:**

- One service-module shape everywhere: `Context.Service` contract + `make` + dependency-preserving layer + production `layer` + honest test layer (`layerTest`/`layerMemory`).
- Three surfaces sharing Application Services: JSON `HttpApi`, HTMX SSR on `HttpRouter`, worker control plane (status + SSE).
- Every expected failure as a `Schema.TaggedError` value; defects only via `casesHandled`-style panics.
- OTLP export that no-ops without a collector; JSON logs in production.

**Non-Goals:**

- Reimplementing exchange worker internals (owner's job; foldering only).
- Multi-node clustering now (contract is cluster promotable, runner stays single-node).
- Changing Postgres schema content (migrations move runner, not tables).
- Prometheus scrape endpoint (OTLP metrics only for now).

## Decisions

### D1 Bun workspaces monorepo, `packages/*` + `apps/*`

Libraries (`domain`, `db`, `config`, `observability`, `control-plane-api`, `crawler`, `worker-contract`) carry no entrypoints; entrypoints live in `apps/control-plane` and `apps/workers/<exchange>`. A future microservice split moves a package behind a socket without re-cutting boundaries. Alternative (single-package incremental rewrite) rejected: it preserves no deployable seam.

### D2 Drizzle stays, via RC `drizzle-orm/effect-postgres`

Existing tables and query shapes are preserved; execution moves behind `PgDrizzle.makeWithDefaults()` over `PgClient.layerConfig({ url: Config.redacted("DATABASE_URL") })`, mirroring opencode's `Database` service (`db` + migrations in one layer). Requires upgrading `drizzle-orm`/`drizzle-kit` to the RC line. Alternative (raw `SqlClient` + hand SQL) rejected: it throws away the tested query set. Verified: `effect-postgres/{driver,session,migrator}` exists in `drizzle-orm@1.0.0-rc.2`.

### D3 JSON CRUD on `HttpApi`, one group per aggregate

`Model.Class` derives DB + JSON variants from one field declaration; `SqlModel.makeRepository` + `SqlSchema` for reads; `HttpApiBuilder.group(Api, "<name>", ...)` handlers map domain errors to declared endpoint errors (reason-wrapper idiom); `HttpApiScalar` docs; `HttpApiTest.groups` + `layerMemory` for tests. Alternative (keep oRPC) rejected by owner; plain `HttpRouter` rejected (loses typed client + OpenAPI).

### D4 SSR on plain `HttpRouter`, same services as the API

HTML pages/partials return `HttpServerResponse.html(...)`; full-vs-fragment branching stays header-driven. Views become pure HTML-string functions (Elysia JSX goes away with Elysia). Alternative (HTML inside `HttpApi` text successes) rejected: no typed-client value, OpenAPI noise.

### D5 Supervisor as an Effect service, single-node

`FiberMap` keyed by `exchangeId/shardId` replaces the `Map` of mutable state; `ChildProcessSpawner.spawn` inside `Scope` replaces `Bun.spawn`+manual kill; stdout becomes a `Stream` decode pipeline; respawn uses `Schedule.min([exponential, spaced(cap)]) + jittered`; `DomainEvents` (`PubSub.bounded` + replay) replaces `MemoryPublisher`; `SubscriptionRef` status feeds control-plane polling and SSE. Per-exchange `LayerMap` pools deferred until a second exchange-specific resource exists.

### D6 Worker transport stays JSONL-over-stdio; `RpcGroup` defined once

`WorkerRpc = RpcGroup[Subscribe, Unsubscribe, Ticks(stream), Health]` is the contract; the stdio transport implements it now, socket/`RpcWorker` later with no contract change. Ticks use backpressured streams (server interrupt = unsubscribe). Cluster `Entity` promotion is a documented follow-up, tested meanwhile via `RpcTest` + `TestRunner.layer`.

### D7 Config + observability as foundation layers

`AppConfig` service (`databaseUrl: Redacted`, `port`, service identity) from `Config`, preserving the local-dev default and production-required behavior of `src/config.ts`. `LoggerLive` (pretty dev / JSON prod via `Layer.unwrap` on `NODE_ENV`) merged with `Otlp.layerFromConfig` (honors `OTEL_*`, no collector = clean noop), provided last at the composition root. `Effect.fn("Service.method")` spans + `annotateLogs({exchange, shard})` at pipeline edges.

### D8 Tests stay on `bun test`

`Effect.runPromise` + layer injection; `it.effect`-style via plain `test` + `Effect.runPromise` (no `@effect/vitest` harness churn); `TestClock`/`Random.withSeed` for deterministic pipeline tests; `HttpApiTest.groups` for API surface. No `vi.mock`/`jest.mock`; fakes are `layerTest`/`layerMemory` or test-local fixtures.

### D9 v4 API volatility contained by source-of-truth rule

`node_modules/effect` is authoritative (AGENTS.md). Verified-against-source names to use: `Schema.Class`, `Schema.decodeUnknownEffect`/`encodeEffect`, `Schema.Literals`, `Schema.UnknownFromJsonString`, `Effect.fn("name")`/`fnUntraced`, `forkDetach`, `zip(..., {concurrent:true})`, `Effect.tx`, `Otlp.layerFromConfig`, `BunRuntime.runMain`, `BunHttpServer.layer`, `BunChildProcessSpawner`, `PgClient.layerConfig`, `Rpc.make`/`RpcGroup`/`RpcServer.layerProtocolStdio`/`RpcTest`, `Entity`/`TestRunner`/`SingleRunner`, `HttpApiBuilder.group`/`layer`, `HttpApiTest.groups`, `HttpApiScalar.layer`, `HttpApiSchema.StreamSse`. Known gaps: no `ConfigProvider.fromMap` (tests set `process.env`, read through the default provider); `Config.*` primitive names re-verified at implementation time.

## Risks / Trade-offs

- [RC churn] Effect v4 RC renames APIs between releases → Mitigation: pin exact versions in all workspace packages; re-verify names against `node_modules/effect/src` before each phase (D9).
- [Drizzle RC upgrade] Table-definition breakage in `drizzle-orm@rc` → Mitigation: upgrade + `drizzle-kit generate` diff review as its own task before any query port; keep 0.45.2 until the diff is clean.
- [Dual transport] stdio-JSONL now vs Rpc later duplicates framing thought → Mitigation: `WorkerRpc` group is the single contract; stdio is one `Protocol` implementation of it.
- [SSE cardinality] Per-shard streams could fan out excessively → Mitigation: one multiplexed control-plane stream with exchange-scoped replay buffer, not per-shard streams.
- [HTMX view port] JSX-to-string rewrite risks markup drift → Mitigation: port view-by-view behind the existing `bun test tests/` HTML assertions where they exist; screenshot-level parity is explicitly out of scope.
- [OTLP noise] Misconfigured exporter could spam logs → Mitigation: `layerFromConfig` noops without endpoint; startup logs exporter state once.

## Migration Plan

Strangler per capability, each phase independently shippable: foundation → one API group live beside oRPC (parametrize base path) → remaining groups → SSR cutover → supervisor cutover (keep old supervisor behind a flag for one release) → worker foldering move → dependency removal (`orpc`, `elysia`, `zod`, `ws`, `amqplib`) → archive change. Rollback at each step is reverting the phase commit; no data migration (same tables).

## Open Questions

- Q1: Add a Prometheus `/metrics` scrape endpoint alongside OTLP? Deferrable: OTLP metrics cover the need; revisit if the operator lacks an OTLP backend.
- Q2: When does single-node supervision become a Cluster deployment (entity per exchange)? Deferrable: trigger is running a second supervisor host; contract is already promotable.
- Q3: Keep `drizzle-seed` or move seeding to the Effect CLI? Deferrable to the CLI phase; no spec impact.
