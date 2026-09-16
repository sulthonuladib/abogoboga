## Context

See proposal.md (Why). Current state shaping this design: `UserActionQueue` declares `worker-changed {exchangeId, action}` and an empty `coin-updated {}` stub with zero publishers/subscribers; eligibility data (`exchange_cryptocurrency` symbols, `_chain` withdraw/deposit flags) exists but `listed`/`tradeEnabled` do not; 13 legacy workers mix codegen templates with one Bun-style script and depend on `ws`/`amqplib`, neither in `package.json`. Verified by experiment: `Bun.spawn` children survive parent exit (orphaned), and script-form user args start at `Bun.argv[2]`. Constraints: Bun + oRPC v2 + Zod v4 + Drizzle; never start server/infra during development; verify with `bun test tests`, `bunx tsc --noEmit`, `call(router...)`.

## Goals / Non-Goals

**Goals:**

- One supervisor in the parent process owning all worker lifecycle and subscription truth.
- A worker contract implementable per exchange without touching the parent.
- Subscription state that converges with the DB after every event, restart, or crash.

**Non-Goals:**

- Exchange workers and per-exchange normalizers (owner-implemented against the contract; test-only dummies stand in).
- Opportunities detection/storage shape (deferred; parent holds the latest-map that will feed it).
- USDT/IDR rate sourcing beyond a single stubbed source with one call site.

## Decisions

**Co-located supervisor, MemoryPublisher retained.** Supervisor lives in the `Bun.serve` process; endpoint handlers publish, same-process listeners reconcile. Alternative (separate supervisor process) rejected: it would require replacing the in-process queue with a cross-process channel for no current scaling need.

**Five-channel worker contract.** argv = immutable bootstrap (`"sym:cmcId,..."` + shard id, parsed once); stdin = live JSONL commands (`subscribe`/`unsubscribe` with coin lists); stdout = canonical ticks, one JSON per line; stderr = logs only; exit code = health (nonzero while desired triggers respawn-with-replay). Stdin chosen over signals (too crude) and sockets (no benefit) — the pipe doubles as liveness: stdin EOF means the parent is gone.

**Parent brain, dumb-pipe workers.** Normalize (exchange-specific, owner side) happens in the worker; IDR conversion, 2M walk, and upsert (shared, must be identical across exchanges) happen once in the parent. Alternative (worker writes DB directly) rejected: N connection pools, duplicated money logic drifting per exchange, per-worker backpressure.

**Long-lived workers, no respawn on coin changes.** Args freeze at spawn, so the old mental model was kill-and-respawn; instead workers stay up and the parent drives exchange-specific sub/unsub messages over stdin. Respawn reserved for crash recovery (replay last-known coin set via argv+stdin) and start/stop. This removes stream gaps on every human-driven suspend.

**First-fit placement, shrink-on-empty, capacity 20.** Add goes to the first shard of that exchange with space, else a new shard spawns. A shard emptied by unsubscribes is terminated. Contiguous-chunk full-exchange respawn on membership change was considered and rejected as unnecessary once live unsub exists; hash-stable assignment deferred as needless bookkeeping at human-triggered event rates.

**Recompute-from-DB on every event.** Event payloads carry identity only; the reconciler re-reads eligibility. This makes double-emission, stale payloads, and the two delist spellings (`listed=false` vs mapping delete) converge to the same state.

**Direct per-tick upsert, no flush.** Accepted write rate (~hundreds/sec) in exchange for a synchronous tick path with no coalescing valve; if the DB lags, ticks queue behind awaits. A periodic flush was considered and rejected per owner decision.

**Orphan defense in depth.** Worker-side: stdin EOF triggers self-termination (worker contract, owner-implemented). Parent-side: boot sweeps processes matching our argv signature, then starts nothing and waits for explicit user starts. Own graceful shutdown terminates all shards.

## Risks / Trade-offs

- [Risk] Orphaned pre-convention workers hold exchange subscriptions the new parent cannot see → Mitigation: boot sweep by argv signature plus EOF self-exit going forward; keep the signature stable and documented in the contract.
- [Risk] Per-tick upsert couples stream rate to DB latency with no backpressure valve → Mitigation: single writer, single pool, one await chain; revisit coalescing only on measured lag.
- [Risk] `Bun.argv[1]`-style indexing bugs (as found in legacy `bitget.ts`) in owner-implemented workers → Mitigation: contract documents index-2 with a dummy worker as runnable reference.
- [Risk] Secrets passed via argv leak through process listings → Mitigation: tokens travel via `Bun.spawn({ env })`, never argv; legacy hardcoded tokens removed during owner-side worker rewrite.
- [Risk] Signal detection needs >= 2 running exchanges but nothing enforces it → Mitigation: detection layer no-ops below 2 (see Open Questions for the allow-vs-block choice on starting a lone exchange).

## Migration Plan

1. Land canonical tick/command types + eligible-set query + `listed`/`tradeEnabled` migration (no behavior change yet).
2. Add route emitters (`worker-changed`, `coin-detail-changed`) behind existing handlers.
3. Add supervisor + state manager + tick pipeline with dummy workers; verify with `bun test tests`, `bunx tsc --noEmit`.
4. Owner rewrites exchange workers against the contract one exchange at a time; legacy `crawl-workers/` removed last.
5. Rollback at any stage: stop exchanges via control endpoint; no worker traffic means no pipeline writes.

## Open Questions

- ~~Thin-book default (spec records partial-with-reached-value): confirm partial snapshots are preferable to skipping the snapshot when a side never reaches 2M IDR.~~ Resolved: skip the update when the target is unreached; partial-fill handling deferred to a future change.
- ~~Lone-exchange start: allow running a single exchange (snapshots only, signals no-op) or require/block below 2 running?~~ Resolved: allow single; signal detection no-ops until >= 2 running.
- ~~Interim USDT/IDR rate source until the cache cron exists (stub constant vs single fetch call site)?~~ Resolved: stub constant at a single call site, replaced by the cron later.
