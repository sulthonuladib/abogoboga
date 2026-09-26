# Design

## Context

- The supervisor (`packages/crawler/src/Supervisor.ts`) currently spawns one `bun` child process per shard via `ChildProcessSpawner` and speaks NDJSON over stdio: commands on stdin, ticks on stdout, logs on stderr, exit codes driving respawn. See proposal.md for why that is being replaced.
- The worker contract package defines both the stdio host (`runStdioWorker`) and an unused `WorkerRpc` group (`Subscribe`, `Unsubscribe`, `Ticks`, `Health`) whose doc comment already anticipates an `RpcWorker` transport.
- Exchange apps (`apps/workers/<slug>`) each ship a transport-agnostic `WorkerSourceFactory`; only their `index.ts` entrypoints touch the host.
- Effect v4 (pinned RC) ships `effect/unstable/rpc` (client/server with worker protocols and `RpcWorker.InitialMessage`), `effect/unstable/workers` (`Worker`/`WorkerPlatform`/`Spawner`), and `@effect/platform-bun` (`BunWorker.layer`, `BunWorkerRunner.layer`). All are already installed; `RpcTest` (in-memory transport) is already used in `WorkerRpc.test.ts`.

## Goals / Non-Goals

**Goals:**
- Keep the supervisor lightweight: lifecycle (start/stop), placement, observation — no per-tick or reconnect work.
- Put resilience inside the worker: fixed 1-second infinite reconnect, subscription set surviving reconnects.
- Give the parent live, worker-reported connection state.
- Preserve the `WorkerSourceFactory` seam so exchange `source.ts` files do not change.

**Non-Goals:**
- Hang/heartbeat detection (the `Health` RPC exists but no watchdog is added).
- Per-worker memory limits or leak remediation beyond safety-net recovery.
- Migrating exchange sources to RPC directly; they stay behind `WorkerSource`.
- Distributing workers across processes or machines.

## Decisions

### D1: Effect RPC over Bun workers as the contract

Use `RpcClient.make(WorkerRpc)` in the supervisor and an RPC server built from the same group in each worker, with `makeProtocolWorker` (client) and `layerProtocolWorkerRunner` (server) as the transports, backed by `BunWorker.layer` / `BunWorkerRunner.layer`.

- *Why*: first-party stack matching the pre-defined `WorkerRpc` group; gets request/response, typed error propagation, stream backpressure/acks, interrupt propagation, defect delivery, and structured-clone transferables for free. The supervisor calls `client.Subscribe({ coins })` instead of writing NDJSON lines, and `Ticks`/`Status` are stream RPCs.
- *Alternatives*: raw postMessage carrying the existing wire schemas — smaller machinery but reimplements acks, interrupts, and error/defect framing by hand; keeping stdio — retains every cost being removed.

### D2: Per-shard protocol with a locally-provided `Spawner` and `InitialMessage`

Each shard fiber constructs its own client protocol (`makeProtocolWorker({ size: 1, concurrency: Infinity })`) inside its scope, providing the exchange entrypoint via `Worker.Spawner` (`(id) => new Worker(entrypointFor(slug))`) and its bootstrap via `RpcWorker.InitialMessage` (`{ exchangeSlug, shardId, coins }`), both `Effect.provideService`d for that scope.

- *Why*: per-exchange entrypoints and per-shard bootstrap require per-shard values; providing them locally avoids a global id→entrypoint registry and shared mutable state. `size: 1` is what keeps the protocol to one worker per shard; the pool `concurrency` is only a parent-side counter of in-flight RPC calls against that one worker and never spawns workers — sharding (workers per exchange) is driven solely by subscription ceilings.
- *Fallback*: if the pool shape fights the one-worker-held-forever usage, a ~30-line single-worker `Protocol` built with `Protocol.make` + `Worker.Worker.run/send` replaces `makeProtocolWorker` with no contract change (and has no concurrency counter at all). Spiking this is the first implementation task.

> **NOTE (verified)**: `concurrency: Infinity` is chosen deliberately: the only long-lived call is the held `Ticks` stream, and commands (`Subscribe`/`Unsubscribe`/`Health`) must never queue behind it. The pool caps checkouts with a plain numeric comparison (`refCount >= concurrency`), so `Infinity` means unbounded — this is an edge of the documented "per-item concurrency limit" API. Spiked and kept: `RpcSpike.test.ts` in `packages/worker-contract` holds the `Ticks` stream over a `size: 1, concurrency: Infinity` pool while issuing concurrent `Subscribe`/`Unsubscribe`/`Health` calls against a Bun worker and all complete without deadlock. If a future Effect version breaks this, set a fixed headroom (any value ≥ 3 works given the held stream plus short commands — 8 is a safe pick) or drop the pool for the `Protocol` fallback above. No other code depends on this value.

### D3: Self-healing lives in the worker's `Ticks` handler

The worker host keeps the subscription set in a `Ref` and the live `WorkerSource` in a `SynchronizedRef`. `Ticks` returns `Stream.retry(buildSourceAndEmit, Schedule.spaced("1 second"))`, where each attempt builds a fresh source seeded with the current subscription set (the factory's `initial` argument), swaps it into the live-source ref, and emits its ticks. `Subscribe`/`Unsubscribe` handlers update the subscription ref and write through to the live source. The schedule is infinite, fixed at 1 second, and resets when the first tick flows after a reconnect.

> **NOTE (changeable)**: the `1 second` delay is a tunable (`Schedule.spaced`); if it changes, update the "Self-healing reconnection" requirement in `specs/crawler-worker-contract` to match.

- *Why*: reconnects rebuild connections (new socket, resubscribe) rather than merely retrying reads; the supervisor never sees transient failures; `WorkerSourceError` maps to a typed RPC error only when a command itself fails.
- *Alternatives*: supervisor-side retry of the `Ticks` call — rejected (puts recovery work on the supervisor and loses subscription continuity); whole-worker exit on failure — the status quo being removed.

### D4: `Status` stream RPC for worker-reported state

Add `Status = Rpc.make("Status", { success: WorkerStatus, stream: true })` to the `WorkerRpc` group, where `WorkerStatus` carries `{ phase: "starting" | "running" | "reconnecting", attempt?, message? }`. The worker host reports phase changes on this stream; the supervisor merges them into `ShardSnapshot.phase` and publishes them through `WorkerEvents` (a reconnecting event replaces the old respawn-scheduled event).

- *Why*: the parent needs live reconnect state for the Workers UI; a separate stream keeps `CanonicalTick` consumers untouched.
- *Alternative*: union payload on `Ticks` — rejected, pollutes tick ingestion.

### D5: Safety net is stream re-acquisition, not process respawn

`makeProtocolWorker` can respawn a dead worker after a fixed 1-second delay and fails outstanding streams with `ClientProtocolError`. A Bun-worker crash test showed that retrying both streams against the same protocol could resume `Ticks` while leaving `Status` stuck. Each shard attempt therefore scopes a per-shard protocol, RPC client, and `Effect.all([Ticks |> forward, Status |> forward], { concurrency: "unbounded" })`. On failure, the attempt scope closes the old client and worker; capped exponential backoff then creates a fresh protocol/client whose initial message reads the shard's current coin set. This re-acquires both streams on a fresh worker and avoids carrying a stale stream client across worker defects.

> **NOTE (changeable)**: the shard fiber's capped exponential backoff is the safety-net delay (mirroring today's `respawnBaseDelayMillis`/`respawnMaxDelayMillis`). `makeProtocolWorker` retains its internal fixed 1-second retry, but a stream failure closes that protocol attempt and cancels its retry before the supervisor creates a fresh protocol.

- *Why*: recreating the scoped protocol resets both RPC streams and the worker from the latest bootstrap coin set; the old exit-code state machine disappears.
- *Alternative*: no supervisor retry (shard dies, UI shows error) — rejected, drops self-healing for bugs.

### D6: Bootstrap via `RpcWorker.InitialMessage`

The worker host reads `{ exchangeSlug, shardId, coins }` via `RpcWorker.initialMessage(schema)`; the client side supplies it per shard (D2). The `--crawler-worker` argv marker, argv indexes, and the bootstrap-coin string codec are deleted.

### D7: Worker entrypoint resolution and graceful stop

`Main.ts` resolves `apps/workers/<slug>/src/index.ts` as a module path for `new Worker(...)` with the existing dummy fallback (Bun compiles TS entrypoints). Stop closes the shard scope; `BunWorker.layerPlatform` posts the close message, awaits the close event with a 5-second timeout, then terminates. The worker host registers `source.close` as a server-scope finalizer and acknowledges the close message, so exchange resources release on graceful shutdown.

### D8: Track tick freshness at the supervisor boundary

Each shard records the local epoch-millisecond receipt time whenever its `Ticks` stream yields a canonical tick. The shard snapshot and worker-control status expose that value as `lastTickAt`, initially `null`; the Workers page renders the timestamp or an explicit no-tick state. This is local receipt time, not the exchange-provided tick timestamp.

### D9: Use Binance partial depth without REST snapshots

The Binance worker subscribes to Spot partial-depth streams (`<symbol>@depth20@100ms`) over a combined WebSocket endpoint. Each message contains a complete top-20 book, so the worker emits those levels directly as a canonical tick and does not fetch a REST snapshot or reconstruct a diff-depth local book. The stream name in the combined envelope identifies the coin because partial-depth payloads do not carry a symbol field.

- *Why*: one 1,000-level REST snapshot per Binance coin consumes substantial shared IP request weight during bootstrap and has already triggered Binance's `-1003` IP ban response. The partial-depth feed eliminates those REST requests.
- *Trade-off*: only the top 20 levels are known. The existing quote pipeline skips a tick when either side cannot satisfy its executable-depth target; it does not estimate depth beyond the received book.
- *Alternatives*: retain diff-depth plus REST snapshots with a global request-weight limiter — preserves deeper local books but makes bootstrap slower and still spends the shared REST budget; omit the snapshot while keeping diff-depth — rejected because deltas alone cannot form a correct initial order book.

## Risks / Trade-offs

- [A native crash, OOM, or hung worker thread now takes down the control plane] → Accepted: exchange sources are pure-TS websocket clients with no native deps; JS-level defects are contained by D5. If native dependencies ever appear, revisit process isolation.
- [Slow memory leak in one exchange source accumulates in the shared process] → Not caught by defect recovery; mitigate by monitoring process RSS and, if needed, a later periodic shard recycle policy. Heartbeat/hang detection is deferred (Health RPC reserved).
- [Pool concurrency deadlock if concurrent shard requests exceed `concurrency`] → Command flows are already sequential per shard; `concurrency: 8` leaves headroom; the D2 fallback protocol removes the bound entirely.
- [`effect/unstable/rpc` and `workers` may change across RC releases] → Version is pinned with the rest of the workspace; these modules are exercised by existing tests (`RpcTest`), and upgrades are lockstep.
- [Loss of standalone NDJSON debugging of a single worker] → Mitigate with a tiny dev driver script that hosts one worker and prints ticks/status, if needed.

## Migration Plan

- The control plane and workers ship together (single process, monorepo deployment), so no cross-version protocol compatibility is needed: flip the host and the supervisor in the same change. Rollback is a git revert.
- Sequence: (1) spike D2 fallback and settle the per-shard protocol shape; (2) build the RPC worker host + `Status` RPC in `worker-contract`, migrate entrypoints; (3) rewrite `Supervisor` over the client protocol; (4) delete `Sweep.ts`, CLI sweep command, argv/stdio codecs, and process fixtures; (5) update tests and the Workers UI.

## Open Questions

- Whether to add a periodic shard recycle (teardown/rebuild per shard on a long interval) as a leak guard — deferred until RSS monitoring shows a problem.
- Whether a heartbeat watchdog on `Health` is needed for hung workers — deferred; the RPC already exists to support it.
