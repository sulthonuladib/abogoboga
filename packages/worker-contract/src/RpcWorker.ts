/**
 * Worker-side RPC transport host.
 *
 * Hosts the {@link WorkerRpc} group inside an RPC worker: the bootstrap
 * identity arrives as the {@link RpcWorker.InitialMessage}, `Subscribe` /
 * `Unsubscribe` commands update the live subscription set, `Ticks` streams
 * canonical ticks with built-in self-healing reconnection, `Status` reports
 * connection phase changes, and `Health` answers liveness probes. Closing the
 * worker releases the exchange source.
 *
 * @module
 */
import { Duration, Effect, Option, Queue, Ref, Schedule, Scope, Stream, SynchronizedRef } from "effect"
import { RpcServer, RpcWorker } from "effect/unstable/rpc"
import { WorkerRunner } from "effect/unstable/workers"
import { BootstrapContext } from "./BootstrapContext.ts"
import type { BootstrapCoin } from "./BootstrapCoin.ts"
import { WorkerRpc, type WorkerStatus } from "./WorkerRpc.ts"
import { WorkerSourceError, type WorkerSource, type WorkerSourceFactory } from "./WorkerSource.ts"

/**
 * Options for {@link runRpcWorker}.
 */
export interface RunRpcWorkerOptions {
  /**
   * Declared exchange slug of the app. Covers runs where the initial message
   * carries no bootstrap context (for example plain `bun run` during
   * development).
   */
  readonly exchangeSlug: string
  /**
   * Exchange owner hook; see {@link WorkerSourceFactory}.
   */
  readonly source: WorkerSourceFactory
}

/**
 * Subscription identity of one coin: `SYMBOL:coingeckoId`.
 *
 * @param coin - Coin to key.
 * @returns The stable subscription key.
 */
const coinKey = (coin: BootstrapCoin): string => `${coin.symbol}:${coin.coingeckoId}`

/**
 * Builds the worker host state: the live subscription set, the live exchange
 * source, the status queue, and the `WorkerRpc` handlers driving them.
 *
 * Shared by {@link runRpcWorker} (real worker host) and the in-process
 * `RpcTest` suites.
 *
 * @param options - Exchange owner hook.
 * @param bootstrap - Worker identity decoded from the initial message.
 * @returns The scoped worker host state and its handlers.
 */
const makeHostState = (options: RunRpcWorkerOptions, bootstrap: BootstrapContext) =>
  Effect.gen(function*() {
    const subscriptions = yield* Ref.make<ReadonlyArray<BootstrapCoin>>(bootstrap.coins)
    const live = yield* SynchronizedRef.make<Option.Option<WorkerSource>>(Option.none())
    const statusQueue = yield* Queue.unbounded<WorkerStatus>()
    const lastStatus = yield* Ref.make<WorkerStatus["phase"]>("starting")

    yield* Queue.offer(statusQueue, { phase: "starting" })

    // Publish a status transition; deduplicates so only phase changes are
    // emitted while the parent holds the `Status` stream.
    const emitStatus = (status: WorkerStatus): Effect.Effect<void> =>
      Effect.gen(function*() {
        const current = yield* Ref.get(lastStatus)

        if (current === status.phase) return

        yield* Ref.set(lastStatus, status.phase)
        yield* Queue.offer(statusQueue, status)
      })

    const writeThrough = (
      coins: ReadonlyArray<BootstrapCoin>,
      kind: "subscribe" | "unsubscribe"
    ): Effect.Effect<void, WorkerSourceError> =>
      Effect.gen(function*() {
        const keys = new Set(coins.map(coinKey))

        yield* Ref.update(subscriptions, (current) =>
          kind === "subscribe"
            ? [...current, ...coins.filter((coin) => !current.some((existing) => coinKey(existing) === coinKey(coin)))]
            : current.filter((coin) => !keys.has(coinKey(coin)))
        )

        const current = yield* SynchronizedRef.get(live)

        if (Option.isNone(current)) return

        if (kind === "subscribe") {
          yield* current.value.subscribe(coins)
        } else {
          yield* current.value.unsubscribe(coins)
        }
      })

    // A failed connection rebuilds the source every second forever; each
    // attempt reports `reconnecting` with its attempt number before the retry
    // delay.
    const reconnectSchedule = Schedule.spaced("1 second").pipe(
      Schedule.addDelay(({ output }) =>
        Effect.as(emitStatus({ phase: "reconnecting", attempt: output + 1 }), Duration.zero)
      )
    )

    const buildAttempt = Effect.gen(function*() {
        const coins = yield* Ref.get(subscriptions)

        const source = yield* options.source(coins, {
          exchangeSlug: bootstrap.exchangeSlug,
          shardId: bootstrap.shardId
        })

        yield* SynchronizedRef.updateEffect(live, (current) =>
          Effect.gen(function*() {
            if (Option.isSome(current)) {
              yield* current.value.close
            }

            return Option.some(source)
          })
        )

        return source.ticks.pipe(
          Stream.tap(() => emitStatus({ phase: "running" }))
        )
      })

    const ticksStream = Stream.unwrap(buildAttempt).pipe(
      Stream.retry(reconnectSchedule),
      Stream.catchCause(() => Stream.never)
    )

    const handlers = yield* WorkerRpc.toHandlers({
      Subscribe: ({ coins }) => writeThrough(coins, "subscribe"),
      Unsubscribe: ({ coins }) => writeThrough(coins, "unsubscribe"),
      Ticks: () => ticksStream,
      Status: () => Stream.fromQueue(statusQueue),
      Health: () => Effect.map(SynchronizedRef.get(live), (current) => ({ running: Option.isSome(current) }))
    })

    return { handlers, live, statusQueue }
  })

/**
 * Runs the worker side of the RPC contract for one exchange.
 *
 * Reads the bootstrap identity from the {@link RpcWorker.InitialMessage},
 * builds the exchange source, serves `Subscribe`/`Unsubscribe` commands against
 * the live subscription set, streams ticks with a fixed 1-second infinite
 * reconnect, and closes the source when the worker shuts down.
 *
 * The returned effect requires a worker runner platform and a scope; inside a
 * Bun worker provide them with {@link BunWorkerRunner.layer}:
 *
 * ```ts
 * BunRuntime.runMain(
 *   Effect.scoped(runRpcWorker(options)).pipe(Effect.provide(BunWorkerRunner.layer))
 * )
 * ```
 *
 * @param options - Exchange owner hook.
 * @returns A worker host effect that runs until the parent closes the worker.
 */
export const runRpcWorker = (
  options: RunRpcWorkerOptions
): Effect.Effect<void, never, WorkerRunner.WorkerRunnerPlatform | RpcServer.Protocol | Scope.Scope> =>
  Effect.gen(function*() {
    const bootstrap = yield* RpcWorker.initialMessage(BootstrapContext).pipe(
      Effect.catchTag("NoSuchElementError", () =>
        Effect.succeed({ exchangeSlug: options.exchangeSlug, shardId: "shard-0", coins: [] } satisfies BootstrapContext)
      ),
      Effect.orDie
    )

    const state = yield* makeHostState(options, bootstrap)

    const scope = yield* Effect.scope

    yield* Scope.addFinalizer(
      scope,
      Effect.gen(function*() {
        const current = yield* SynchronizedRef.getAndSet(state.live, Option.none())

        if (Option.isSome(current)) {
          yield* current.value.close
        }

        yield* Queue.shutdown(state.statusQueue)
      }).pipe(Effect.ignoreCause)
    )

    return yield* RpcServer.make(WorkerRpc).pipe(Effect.provideContext(state.handlers))
  })

export { makeHostState as workerHostState }
