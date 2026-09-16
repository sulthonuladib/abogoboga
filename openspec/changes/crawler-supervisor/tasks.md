## 1. Contract types and eligibility query

- [ ] 1.1 Add canonical tick and stdin command types shared by parent and worker implementers, verified by `bunx tsc --noEmit`
- [ ] 1.2 Add `listed` (default true) and `tradeEnabled` (default true) to `exchange_cryptocurrency` with migration, verified by `bun run db:push` applying cleanly on a fresh database
- [ ] 1.3 Implement the eligible-set query (listed AND tradeEnabled AND >=1 fully-enabled chain per exchange coin), verified by a `bun test tests` case covering suspend-removes-eligibility
- [ ] 1.4 Add the orderbook snapshot table plus per-tick upsert, verified by a `bun test tests` case where two successive ticks leave the later snapshot stored

## 2. Event emission from routes

- [ ] 2.1 Add the worker control endpoint publishing `worker-changed` on success only, verified via `call(router...)` showing an event on start and none on failed validation
- [ ] 2.2 Emit `coin-detail-changed` from mapping add/update/delete routes after successful writes, verified via `call(router...)` showing an event on delist and none on failed mutation
- [ ] 2.3 Emit `coin-detail-changed` from chain add/update/delete routes after successful writes, verified via `call(router...)` showing an event on suspend and none on missing-row update
- [ ] 2.4 Replace the empty `coin-updated` stub with the real `coin-detail-changed` payload, verified by `bunx tsc --noEmit`

## 3. Supervisor and state manager

- [ ] 3.1 Implement spawn with argv bootstrap plus stdin command writer, verified by a dummy worker test receiving its initial coin set
- [ ] 3.2 Implement stdout JSONL tick intake and stderr log drain as separate channels, verified by a dummy worker test where interleaved logs never corrupt tick parsing
- [ ] 3.3 Implement the shard table with first-fit placement and shrink-on-empty, verified by `bun test tests` cases for fill-19/20, spawn-when-full, and kill-when-empty
- [ ] 3.4 Implement crash respawn with backoff replaying the last-known coin set, verified by killing a dummy worker and observing resubscription
- [ ] 3.5 Implement boot sweep of stale argv-signature processes with start-nothing policy, verified by booting with a planted orphan and observing its termination with zero running exchanges

## 4. Tick pipeline

- [ ] 4.1 Implement IDR conversion behind a single stub-constant call site, verified by a `bun test tests` case converting a USDT-quoted tick at the stub rate
- [ ] 4.2 Implement the 2M IDR volume walk producing buyPrice/sellPrice/buyAmount/sellAmount, verified by `bun test tests` cases for full-target books on both sides
- [ ] 4.3 Implement skip-on-thin-book (snapshot untouched when either side totals below 2M IDR), verified by a `bun test tests` case leaving the prior snapshot stored
- [ ] 4.4 Wire pipeline output to per-tick upsert end to end from dummy worker stdout to database row, verified by `bun test tests` plus `bunx tsc --noEmit`

## 5. Dummy workers and contract reference

- [ ] 5.1 Add a test-only dummy worker implementing argv bootstrap, stdin subscribe/unsubscribe, stdout canonical ticks, and stdin-EOF self-exit, verified by driving it through the full start, add, suspend, delist, stop sequence
- [ ] 5.2 Document the worker contract (channels, argv index 2, EOF rule, env-only secrets) for owner-side exchange implementations, verified by review against the dummy worker behavior
