# NEXT SESSION — READ THEN DELETE THIS FILE

> **Next session: read this file, then delete it (`rm NEXT_SESSION.md`).
> Do not commit it. It is a quota-crash handoff, not repo documentation.**

## Where things stand

- Branch: `opencode/start-6.x-tasks` (worktree `effect-rewrite`).
- Everything below is committed in HEAD `e8b97eb` ("stale: squash me later…").
  Tree is clean. Nothing is stashed.
- OpenSpec change `effect-rewrite`: `tasks.md` still reads **16/31**.
  Checkboxes were never updated — the work below is done-but-unmarked.

## Done but unmarked (verify, then tick the boxes)

- **8.2 workers HttpApi**: `packages/control-plane-api/src/WorkerControl.ts`
  (port + `layerTest`), `WorkersApi.ts`, `WorkersHandlers.ts`,
  `WorkersApi.test.ts`. Last run: `bun test packages/control-plane-api`
  **32 pass / 0 fail**, oxlint clean.
- **Mutation-event seam**: `CoinDetailEvents.ts` + test; `Market`/`ChainLink`
  handlers publish mapping/chain-link changes for the future Reconciler.
- **8.1 worker apps**: `packages/worker-contract/src/StdioWorker.ts` (+ test,
  + `testing/dummy-worker.ts`), `apps/workers/<13 exchanges + dummy>/`
  (thin `BunRuntime.runMain` entrypoints + owner-hook `source.ts` stubs).
  Root `package.json` workspaces now `["packages/*", "apps/*", "apps/workers/*"]`.
- **9.1 CLI**: `apps/cli/src/` (`CoinData`, `TesterExchanges`, `Commands`,
  `SeedCommands`, `Sweep`, tests). Entry wires `Database.layer` lazily so
  `sweep` never opens a connection.
- **7.x foundations only**: `packages/crawler/src/WorkerEvents.ts`
  (DomainEvent union + replaying `DomainEvents` bus), `Sweep.ts`
  (`sweepStaleWorkers`). `index.ts` is still a placeholder.

## Still to do (in this order)

1. **7.1 `Supervisor`** (`packages/crawler/src/Supervisor.ts` + tests):
   FiberMap shards, Scope-bound `ChildProcessSpawner.spawn`, Stream tick
   decode via `decodeTickLine`, `Schedule` backoff respawn, boot sweep,
   `layerTest` fake. Spec: crash-respawn replays coins, clean-exit drops,
   stop cancels respawn.
2. **7.2 `Reconciler`** (`Reconciler.ts`): fiber over `DomainEvents`,
   eligibility recomputed from DB via `Database`, never trusted from payloads.
   Needs a `CoinDetailEvents`→`DomainEvents` bridge at the composition root.
3. **7.3 `TickPipeline`** (`TickPipeline.ts`): port `processTick`/quote math,
   TestClock-deterministic, thin-book skip, snapshot upsert via `Database`.
4. **6.1/6.2 SSR**: `apps/control-plane/src/web/` has only
   `Html/Layout/Http/Fragments/views/Controls` scaffolding — no `Routes.ts`,
   no page views, no tests. Build the HttpRouter pages/partials/tests,
   reusing Phase-5 services in-process.
5. **8.3 `/workers` page** against `WorkerControl` (2s HTMX poll + SSE tail).
6. **6.3, 9.2, 9.3, 9.4, 10.x**: production `WorkerControl` layer over the real
   `Supervisor`, composition root (`Layer.launch`), legacy `src/**` deletion,
   full gate, `openspec validate`. Mark tasks `[x]` only after each gate passes.

## Gotchas

- Do NOT re-implement exchange websocket internals in `apps/workers` (owner's job).
- `packages/control-plane-api` tests must provide `WorkersHandlers`
  (+ `WorkerControl.layerTest`) wherever `HttpApiBuilder.layer(Api)` is built.
- Do NOT spawn subagents (see AGENTS.md). Prior subagent spawns died on
  quota and left partial work that had to be reconstructed.
