## Why

Live orderbook data per exchange is the feedstock for cross-exchange arbitrage signals, but there is currently no supervisor: 13 legacy crawl-workers exist with no spawning, no lifecycle, and no connection to the metadata API. This change introduces the parent-side supervisor that turns user actions (start/stop worker, assign/delist coin, suspend network) into running, correctly-subscribed exchange subprocesses.

## What Changes

- New supervisor running inside the API (parent) process: listens on `UserActionQueue`, spawns `Bun.spawn` workers per exchange, sharded at 20 coins per subprocess.
- Parent-to-worker contract: immutable bootstrap via argv, live subscribe/unsubscribe commands via child stdin, canonical ticks back via stdout (JSONL), logs via stderr, exit code as health signal.
- Parent-side tick pipeline: parse canonical tick, convert to IDR, walk orderbook to 2M IDR volume target, upsert per-exchange orderbook snapshot. Per-tick upsert, no flush loop.
- State manager with desired-vs-actual reconciliation: first-fit placement on coin add (fill a shard with space, else spawn), targeted unsubscribe on suspend/delist, shard shrink on empty, respawn-with-replay on crash.
- Route emitters: worker control endpoint publishes `worker-changed`; mapping and chain-mutation routes publish enriched `coin-detail-changed` after successful writes.
- Schema: add `listed` and `tradeEnabled` to `exchange_cryptocurrency`; strict stream gate (listed AND tradeEnabled AND >=1 fully-enabled chain).
- Boot policy: start nothing, sweep stale workers by argv signature, wait for explicit user starts. Signal detection requires >= 2 running exchanges.
- Test-only dummy workers implementing the worker side of the contract (real exchange workers and per-exchange normalizers are out of scope, owner-implemented).

## Capabilities

### New Capabilities

- `crawler-supervisor`: process lifecycle (spawn, stdin command channel, stdout tick intake, crash respawn, boot sweep, graceful shutdown) and shard placement (first-fit, shrink-on-empty, capacity 20).
- `crawler-subscription-state`: desired-vs-actual subscription tracking per shard, eligibility recompute, strict per-(chain, exchange, cryptocurrency) stream gate.
- `crawler-tick-pipeline`: canonical tick intake, IDR conversion, 2M IDR volume walk to buyPrice/sellPrice/buyAmount/sellAmount, per-tick orderbook upsert.
- `crawler-worker-events`: `worker-changed` control endpoint and `coin-detail-changed` emissions from mapping/chain routes, emitted only after successful writes.

### Modified Capabilities

- None (no existing specs).

## Impact

- New code: supervisor/state-manager module, worker control endpoint, canonical tick types shared with worker implementers, eligible-set query, dummy workers (test-only).
- Modified: `exchange-cryptocurrency` mapping routes + `exchange-cryptocurrency-chain` routes gain post-write event emission; `UserActionQueue` `coin-updated` stub replaced by a real `coin-detail-changed` payload; schema migration for `listed`/`tradeEnabled`.
- No new runtime dependencies (Bun stdio + existing Drizzle/Postgres). No changes to exchange worker internals — worker authors implement against the declared contract.
