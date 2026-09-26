import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { Duration, Effect, Ref, Stream } from "effect"
import { RpcClient, RpcWorker } from "effect/unstable/rpc"
import { fileURLToPath } from "node:url"
import type { BootstrapCoin } from "./BootstrapCoin.ts"
import type { CanonicalTick } from "./CanonicalTick.ts"
import { WorkerRpc } from "./WorkerRpc.ts"

/**
 * Runnable worker fixture: an RPC worker hosting the `WorkerRpc` group on a
 * synthetic source that ticks every 50ms.
 */
const fixturePath = fileURLToPath(new URL("./testing/dummy-rpc-worker.ts", import.meta.url))

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

const sol: BootstrapCoin = { symbol: "SOL", coingeckoId: "solana" }

/**
 * Polls a condition every 20ms until it holds or the deadline passes.
 *
 * @param check - Condition effect.
 * @param label - Description used in the timeout defect.
 */
const waitUntil = (check: Effect.Effect<boolean>, label: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (yield* check) return

      yield* Effect.sleep(Duration.millis(20))
    }

    return yield* Effect.die(new Error(`timed out waiting for ${label}`))
  })

/**
 * Builds a client over the per-shard worker pool shape under spike test:
 * one worker per protocol (`size: 1`) with an unbounded parent-side counter of
 * in-flight calls (`concurrency: Infinity`) so the held `Ticks` stream never
 * blocks commands.
 */
const makeClient = Effect.gen(function*() {
  const protocol = yield* RpcClient.makeProtocolWorker({ size: 1, concurrency: Infinity }).pipe(
    Effect.provide(BunWorker.layer(() => new Worker(fixturePath))),
    Effect.provideService(
      RpcWorker.InitialMessage,
      Effect.succeed([{ exchangeSlug: "dummy", shardId: "shard-0", coins: [btc] }, []])
    ),
    Effect.orDie
  )

  return yield* RpcClient.make(WorkerRpc).pipe(Effect.provideService(RpcClient.Protocol, protocol))
})

describe("WorkerRpc over Bun workers (pool spike)", () => {
  test(
    "holds the Ticks stream while Subscribe/Unsubscribe/Health complete without deadlock",
    async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const client = yield* makeClient

            const ticks = yield* Ref.make<ReadonlyArray<CanonicalTick>>([])

            yield* client.Ticks(undefined).pipe(
              Stream.runForEach((tick) => Ref.update(ticks, (received) => [...received, tick])),
              Effect.forkScoped
            )

            yield* waitUntil(
              Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "BTC")),
              "BTC tick from bootstrap"
            )

            // Held-stream concurrency: commands must complete while Ticks keeps
            // flowing through the same single worker.
            yield* Effect.all([client.Health(undefined), client.Subscribe({ coins: [sol] })], {
              concurrency: "unbounded"
            })

            yield* waitUntil(
              Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "SOL")),
              "SOL tick after subscribe"
            )

            // Unsubscribe completes on the held stream too, stopping SOL ticks.
            yield* client.Unsubscribe({ coins: [sol] })

            const health = yield* client.Health(undefined)

            expect(health).toEqual({ running: true })

            return true
          })
        )
      )

      expect(result).toBe(true)
    },
    20000
  )
})
