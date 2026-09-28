import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { Duration, Effect, Ref, Stream } from "effect"
import { RpcClient, RpcWorker } from "effect/unstable/rpc"
import { fileURLToPath } from "node:url"
import type { BootstrapCoin, CanonicalTick } from "@lister/worker-contract"
import { WorkerRpc } from "@lister/worker-contract"

/**
 * The `apps/workers/<slug>/src/index.ts` entrypoint for one exchange, resolved
 * relative to this package (`apps/workers` sits above `packages/crawler`).
 */
const workersRoot = fileURLToPath(new URL("../../../apps/workers/", import.meta.url))

/**
 * Resolves the runnable worker entrypoint for one exchange, falling back to
 * the synthetic dummy worker when an exchange has no app yet.
 *
 * @param exchangeSlug - Exchange slug from the database.
 * @returns Absolute path of the worker entrypoint.
 */
export const workerEntrypointFor = (exchangeSlug: string): string =>
  `${workersRoot}${exchangeSlug}/src/index.ts`

const dummyEntrypoint = workerEntrypointFor("dummy")

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

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

describe("worker entrypoint smoke", () => {
  test(
    "spawning the dummy app entrypoint as a Bun worker delivers bootstrap ticks",
    async () => {
      const received = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const protocol = yield* RpcClient.makeProtocolWorker({ size: 1, concurrency: Infinity }).pipe(
              Effect.provide(BunWorker.layer(() => new Worker(dummyEntrypoint))),
              Effect.provideService(
                RpcWorker.InitialMessage,
                Effect.succeed([{ exchangeSlug: "dummy", shardId: "shard-0", coins: [btc] }, []])
              ),
              Effect.orDie
            )

            const client = yield* RpcClient.make(WorkerRpc).pipe(
              Effect.provideService(RpcClient.Protocol, protocol)
            )

            const ticks = yield* Ref.make<ReadonlyArray<CanonicalTick>>([])

            yield* client.Ticks(undefined).pipe(
              Stream.runForEach((tick) => Ref.update(ticks, (received) => [...received, tick])),
              Effect.forkScoped
            )

            yield* waitUntil(
              Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "BTC")),
              "bootstrap BTC tick"
            )

            const collected = yield* Ref.get(ticks)

            expect(collected.length).toBeGreaterThan(0)
            expect(collected.every((tick) => tick.exchangeSlug === "dummy")).toBe(true)

            return collected
          })
        )
      )

      expect(received.some((tick) => tick.symbol === "BTC")).toBe(true)
    },
    20000
  )
})
