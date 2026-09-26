# Tasks

## 1. Protocol spike

- [x] 1.1 Spike a per-shard RPC client with `makeProtocolWorker({ size: 1, concurrency: Infinity })` over `BunWorker.layer`, holding a `Ticks` stream while issuing concurrent `Subscribe`/`Unsubscribe`/`Health` calls against a fixture worker, and verify all calls complete without deadlock (`bun test` on a spike test file)
- [x] 1.2 If the pool shape misbehaves in 1.1, implement the single-worker `Protocol` fallback via `Protocol.make` + `Worker.Worker.run/send` and verify the same concurrency test passes; otherwise record that the pool shape is kept in design.md

## 2. Worker contract: RPC host

- [x] 2.1 Add the `Status` RPC and `WorkerStatus` schema (`phase: starting | running | reconnecting`, `attempt?`, `message?`) to the `WorkerRpc` group and extend `WorkerRpc.test.ts` to cover it via `RpcTest`, verifying `bun test packages/worker-contract` passes
- [x] 2.2 Add a `BootstrapContext` schema (`exchangeSlug`, `shardId`, `coins`) for the `InitialMessage`, with a round-trip test in the contract package
- [x] 2.3 Implement `runRpcWorker`: read `InitialMessage`, keep the subscription set in a `Ref` and the live `WorkerSource` in a `SynchronizedRef`, wire `Subscribe`/`Unsubscribe` write-through handlers, `Ticks` as `Stream.retry(build, Schedule.spaced("1 second"))` reseeded from current subscriptions, `Status` emission, `Health`, and `source.close` on server scope finalization — verify with `RpcTest`-based tests covering reconnect reseed and status ordering (`bun test packages/worker-contract`)
- [x] 2.4 Delete `StdioWorker.ts`, `WorkerCommand.ts`, and the argv bootstrap codec from the contract package, and remove/rewrite `StdioWorker.test.ts` and `WireFormat.test.ts` so `bun test packages/worker-contract` and `bunx tsc --noEmit` pass

## 3. Worker apps migration

- [x] 3.1 Flip every `apps/workers/*/src/index.ts` (15 entrypoints) from `runStdioWorker` to `runRpcWorker` provided with `BunWorkerRunner.layer`, verifying each app still typechecks (`bunx tsc --noEmit`)
- [x] 3.2 Add a smoke test that spawns one exchange entrypoint as a Bun worker from the supervisor side and asserts bootstrap ticks arrive, verifying `bun test` covers the worker-side integration
- [x] 3.3 Update `apps/workers/AGENTS.md` so the tick-cadence note refers to the ticks stream instead of stdio
- [x] 3.4 Switch Binance from diff-depth plus REST snapshots to combined partial-depth `@depth20@100ms` streams; decode stream envelopes, emit top-20 canonical ticks, and cover mapping/decoding/tick conversion without REST access

## 4. Supervisor over RPC

- [x] 4.1 Rewrite `Supervisor` shard fibers to build a per-shard RPC client (per-shard `Spawner` + `InitialMessage`, see design D2), forward `Ticks` to `onTick` and `Status` into `ShardSnapshot.phase` + `WorkerEvents` (add a reconnecting event), and wrap stream holding in `Effect.retry` with capped exponential backoff (design D5) — keeping the existing start/stop/addCoins/removeCoins/placement API, verified by `bun test packages/crawler`
- [x] 4.2 Rewrite `Supervisor.test.ts` fixtures: replace `crash-worker`/`clean-exit-worker` process fixtures with Bun worker fixtures (throwing worker, graceful-close worker) and cover safety-net re-acquisition and stop-during-recovery, verifying `bun test packages/crawler` passes
- [x] 4.3 Update `Main.ts`: replace `BunServices.layer` wiring with `BunWorker` layers and turn `workerScriptFor` into worker-entrypoint module resolution with the dummy fallback, verifying the control plane typechecks and boots (`bun run apps/control-plane/src/index.ts` starts and serves)

## 5. Process machinery cleanup

- [x] 5.1 Delete `packages/crawler/src/Sweep.ts`, `apps/cli/src/Sweep.ts`, and the `sweep` CLI subcommand, and drop their exports, verifying `bun test apps/cli` passes and `bun run apps/cli/src/index.ts --help` no longer lists sweep
- [x] 5.2 Replace the pid column in `apps/control-plane/src/web/views/Workers.ts` with the worker-reported phase/attempt, verifying the workers page test in `apps/control-plane` passes
- [x] 5.3 Record each shard's local tick receipt time in its snapshot, expose nullable `lastTickAt` in worker-control status, and render the timestamp or an explicit no-tick state in the Workers UI, with supervisor, API, and page coverage

## 6. Integration checks

- [x] 6.1 Run the full suite (`bun test packages apps`), `bunx tsc --noEmit`, and `bun run lint`, verifying all pass
- [x] 6.2 Manual smoke waived by user; not run (automated tests relied upon instead)
