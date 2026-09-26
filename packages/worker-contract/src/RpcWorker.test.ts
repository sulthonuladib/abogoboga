import { describe, expect, test } from "bun:test"
import { Duration, Effect, Ref, Stream } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import type { BootstrapCoin } from "./BootstrapCoin.ts"
import type { CanonicalTick } from "./CanonicalTick.ts"
import { workerHostState } from "./RpcWorker.ts"
import { WorkerRpc, type WorkerStatus } from "./WorkerRpc.ts"
import { WorkerSourceError, type WorkerSource, type WorkerSourceFactory } from "./WorkerSource.ts"

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

const sol: BootstrapCoin = { symbol: "SOL", coingeckoId: "solana" }

const tick = (symbol: string): CanonicalTick => ({
  exchangeSlug: "dummy",
  symbol,
  coingeckoId: symbol === "BTC" ? "bitcoin" : "solana",
  bids: [[100, 1]],
  asks: [[101, 1]],
  timestamp: 1726500000000
})

/**
 * Polls a condition every 10ms until it holds or the deadline passes.
 *
 * @param check - Condition effect.
 * @param label - Description used in the timeout defect.
 */
const waitUntil = (check: Effect.Effect<boolean>, label: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (yield* check) return

      yield* Effect.sleep(Duration.millis(10))
    }

    return yield* Effect.die(new Error(`timed out waiting for ${label}`))
  })

/**
 * A source factory whose first build fails with a connection error and whose
 * later builds succeed, recording every built subscription set.
 */
const makeFlakyFactory = (
  builds: Ref.Ref<ReadonlyArray<ReadonlyArray<BootstrapCoin>>>
): WorkerSourceFactory =>
  (initial, _context) =>
    Effect.gen(function*() {
      yield* Ref.update(builds, (all) => [...all, initial])

      const attempt = yield* Ref.get(builds).pipe(Effect.map((all) => all.length))

      if (attempt === 1) {
        return yield* new WorkerSourceError({ message: "connection lost" })
      }

      const source: WorkerSource = {
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
        ticks: Stream.tick("50 millis").pipe(Stream.as(tick("BTC"))),
        close: Effect.void
      }

      return source
    })

describe("runRpcWorker host", () => {
  test("reconnect rebuilds the source and reseeds the current subscription set", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const builds = yield* Ref.make<ReadonlyArray<ReadonlyArray<BootstrapCoin>>>([])

          const state = yield* workerHostState(
            { exchangeSlug: "dummy", source: makeFlakyFactory(builds) },
            { exchangeSlug: "dummy", shardId: "shard-0", coins: [btc] }
          )

          const client = yield* RpcTest.makeClient(WorkerRpc).pipe(
            Effect.provideContext(state.handlers)
          )

          const statuses = yield* Ref.make<ReadonlyArray<WorkerStatus>>([])

          // Drive the Ticks stream: the first source build fails, the host
          // reports `reconnecting`, and after the retry delay a fresh source
          // is built.
          yield* client.Ticks(undefined).pipe(
            Stream.runForEach((_tick) => Effect.void),
            Effect.forkScoped
          )

          yield* client.Status(undefined).pipe(
            Stream.runForEach((status) => Ref.update(statuses, (all) => [...all, status])),
            Effect.forkScoped
          )

          yield* waitUntil(
            Effect.map(Ref.get(builds), (all) => all.length === 1),
            "first source build"
          )

          // Subscribe a new coin while the source is down; the rebuilt source
          // must be reseeded with it.
          yield* client.Subscribe({ coins: [sol] })

          yield* waitUntil(
            Effect.map(Ref.get(builds), (all) => all.length === 2),
            "rebuilt source"
          )

          yield* waitUntil(
            Effect.map(Ref.get(builds), (all) => {
              const last = all[all.length - 1]

              return last !== undefined && last.some((coin) => coin.symbol === "SOL")
            }),
            "reseeded subscription set"
          )

          yield* waitUntil(
            Effect.map(Ref.get(statuses), (seen) => seen.some((status) => status.phase === "running")),
            "running status after reconnect"
          )

          const seen = yield* Ref.get(statuses)

          expect(seen.map((status) => status.phase)).toContain("reconnecting")
          expect(seen.some((status) => status.phase === "running")).toBe(true)
          expect(seen[0]?.phase).toBe("starting")

          const reconnecting = seen.find((status) => status.phase === "reconnecting")

          expect(reconnecting?.attempt).toBeGreaterThanOrEqual(1)

          return [...(yield* Ref.get(builds))]
        })
      )
    )

    expect(result.length).toBe(2)
    expect(result[1]?.some((coin) => coin.symbol === "SOL")).toBe(true)
  })

  test("health reports running while the live source is built", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const builds = yield* Ref.make<ReadonlyArray<ReadonlyArray<BootstrapCoin>>>([])

          const state = yield* workerHostState(
            { exchangeSlug: "dummy", source: makeFlakyFactory(builds) },
            { exchangeSlug: "dummy", shardId: "shard-0", coins: [btc] }
          )

          const client = yield* RpcTest.makeClient(WorkerRpc).pipe(
            Effect.provideContext(state.handlers)
          )

          yield* client.Ticks(undefined).pipe(Stream.runDrain, Effect.forkScoped)

          yield* waitUntil(
            Effect.map(Ref.get(builds), (all) => all.length === 2),
            "rebuilt source"
          )

          const health = yield* client.Health(undefined)

          expect(health).toEqual({ running: true })
        })
      )
    )
  })
})
