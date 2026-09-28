# Proposal

## Why

The crawler supervisor spawns one `bun` child process per shard and speaks newline-delimited JSON over stdio. Resilience is implemented as "process crashed -> respawn with backoff", which is heavyweight: every websocket blip tears down and reboots a full process, loses all subscription state, and requires argv bootstrap plus orphan sweeping via `ps`. Effect v4 already ships an RPC-over-workers stack (RPC client/server with a Bun worker transport), and this repository's `WorkerRpc` group was pre-defined for exactly this transport but is currently dead code. This change moves resilience to where the failure happens — inside the worker — and replaces child processes with in-process Bun workers speaking RPC.

## What Changes

- Replace the stdio/NDJSON transport with Effect RPC over Bun workers: the supervisor becomes an RPC client, each exchange worker app becomes an RPC server.
- Keep the exchange-facing seam intact: `WorkerSourceFactory` remains unchanged and worker sources remain transport-agnostic. Binance's `source.ts` specifically switches to partial-depth WebSocket snapshots to avoid weight-heavy REST bootstrap; other exchange sources stay unchanged. The shared host (`runStdioWorker`) is replaced by `runRpcWorker`, which adapts a `WorkerSource` to the RPC group.
- Add self-healing inside the worker: connection failures rebuild the source and re-subscribe the current coin set via `Stream.retry` with a fixed 1-second infinite schedule. The supervisor no longer reacts to routine connection loss.
- Add a `Status` stream RPC: each worker emits `starting`/`running`/`reconnecting` state to the parent, which merges it into shard snapshots, domain events, and the Workers UI.
- Wire canonical worker ticks into the control-plane ingestion pipeline, retain per-shard tick freshness, and show the last tick alongside phase/attempt in the Workers UI.
- Replace argv bootstrap with `RpcWorker` `InitialMessage` carrying `{ exchangeSlug, shardId, coins }`.
- Supervisor keeps start/stop and shard placement; its crash-respawn machinery becomes a minimal safety-net loop that re-acquires the tick/status streams when a worker dies of a defect (the worker transport itself respawns dead workers with a fixed 1-second delay).
- Remove child-process machinery: `Sweep.ts` and the `lister sweep` CLI command, the `--crawler-worker` argv marker/codec, exit-code respawn, and the pid shown in the Workers UI. **BREAKING**: the `sweep` CLI subcommand is removed.
- One worker per shard remains the model (exchanges shard because of per-connection subscription ceilings); single-connection exchanges are the one-shard case.

## Capabilities

### New Capabilities

- `crawler-worker-contract`: The RPC contract between the supervisor and exchange workers — bootstrap identity, subscribe/unsubscribe commands, tick and status streams, health, self-healing reconnect semantics, and clean shutdown.
- `crawler-supervision`: Supervisor behavior — per-exchange start/stop, shard placement by capacity, per-shard worker lifecycle, status observation into snapshots/events, and safety-net re-acquisition on worker death.

### Modified Capabilities

<!-- none: the project has no existing specs (openspec list --specs is empty) -->

## Impact

- **Packages**: `worker-contract` (RPC host replaces `StdioWorker`; `WorkerCommand` and argv wire codecs removed; `Status` added to `WorkerRpc`), `crawler` (`Supervisor` transport rewritten; per-shard tick freshness; `Sweep.ts` removed; `WorkerEvents` gains a reconnecting event), `control-plane` (worker entrypoint resolution, tick-ingestion wiring, and Workers UI phase/attempt/freshness), `cli` (`sweep` command removed), `apps/workers/*` (15 entrypoints swap host; Binance source uses partial depth while other `source.ts` files stay unchanged).
- **Dependencies**: no new packages — `@effect/platform-bun` (`BunWorker`/`BunWorkerRunner`) and `effect/unstable/{rpc,workers}` are already installed with Effect v4 RC.
- **Tests**: `Supervisor.test.ts`, `StdioWorker.test.ts`, `WireFormat.test.ts`, `WorkerRpc.test.ts` updated; worker fixtures rewritten (crash/clean-exit process fixtures no longer apply); Binance partial-depth mapping and decoding tests; new worker-host tests via `RpcTest` in-memory transport plus Bun worker and deterministic control-plane reconnect fixtures.
- **Operations**: no orphan processes to sweep; lower memory footprint (shared process instead of N+1 runtimes). Tradeoff: a native crash, OOM, or hung worker thread now takes down the control plane instead of being contained per shard — recorded as an accepted risk given exchange sources are pure-TS websocket clients.
