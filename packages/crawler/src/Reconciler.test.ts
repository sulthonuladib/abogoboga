import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { type BootstrapCoin } from "@lister/worker-contract"
import { Duration, Effect, Layer, Option, Ref } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Eligibility, Reconciler } from "./Reconciler.ts"
import { Supervisor, type ExchangeSnapshot } from "./Supervisor.ts"
import { DomainEvents } from "./WorkerEvents.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const dummyWorker = join(repoRoot, "packages/worker-contract/src/testing/dummy-rpc-worker.ts")

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

const eth: BootstrapCoin = { symbol: "ETH", coingeckoId: "ethereum" }

const sol: BootstrapCoin = { symbol: "SOL", coingeckoId: "solana" }

/** Registry entry for one exchange: its slug and currently eligible coins. */
interface RegistryEntry {
  readonly slug: string
  readonly coins: ReadonlyArray<BootstrapCoin>
}

type Registry = Map<number, RegistryEntry>

const setRegistry = (registry: Ref.Ref<Registry>, exchangeId: number, entry: RegistryEntry) =>
  Ref.update(registry, (current) => new Map(current).set(exchangeId, entry))

const eligibilityLayer = (registry: Ref.Ref<Registry>): Layer.Layer<Eligibility> =>
  Layer.succeed(
    Eligibility,
    Eligibility.of({
      exchangeSlug: (exchangeId) =>
        Effect.map(Ref.get(registry), (current) => {
          const entry = current.get(exchangeId)

          return entry === undefined ? Option.none() : Option.some(entry.slug)
        }),
      coinsForExchange: (exchangeId) =>
        Effect.map(Ref.get(registry), (current) => current.get(exchangeId)?.coins ?? [])
    })
  )

const coinsOf = (snapshot: ReadonlyArray<ExchangeSnapshot>, exchangeId: number): ReadonlyArray<BootstrapCoin> =>
  (snapshot.find((exchange) => exchange.exchangeId === exchangeId)?.shards ?? []).flatMap((shard) => [
    ...shard.coins
  ])

const symbolsOf = (snapshot: ReadonlyArray<ExchangeSnapshot>, exchangeId: number): ReadonlyArray<string> =>
  coinsOf(snapshot, exchangeId)
    .map((coin) => coin.symbol)
    .sort()

const waitUntil = (check: Effect.Effect<boolean>, label: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (yield* check) return

      yield* Effect.sleep(Duration.millis(20))
    }

    return yield* Effect.die(new Error(`timed out waiting for ${label}`))
  })

const runWithReconciler = <A, E>(
  registry: Ref.Ref<Registry>,
  program: Effect.Effect<A, E, Supervisor | DomainEvents>
): Promise<A> => {
  const base = Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform)

  const dependencies = Layer.mergeAll(
    Supervisor.layer({ workerScript: dummyWorker }).pipe(Layer.provide(base)),
    base,
    eligibilityLayer(registry)
  )

  return Effect.runPromise(
    Effect.scoped(program.pipe(Effect.provide(Reconciler.layer.pipe(Layer.provideMerge(dependencies)))))
  )
}

describe("Reconciler convergence", () => {
  test("starts on operator intent, then adds and removes coins from database truth", async () => {
    const registry = Ref.makeUnsafe<Registry>(new Map([[1, { slug: "dummy-ex", coins: [btc, eth] }]]))

    await runWithReconciler(
      registry,
      Effect.gen(function*() {
        const supervisor = yield* Supervisor
        const events = yield* DomainEvents

        yield* events.publish({ type: "worker-changed", exchangeId: 1, action: "start" })

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => symbolsOf(snapshot, 1).length === 2),
          "initial start convergence"
        )

        expect(symbolsOf(yield* supervisor.snapshot, 1)).toEqual(["BTC", "ETH"])

        yield* setRegistry(registry, 1, { slug: "dummy-ex", coins: [btc, eth, sol] })
        yield* events.publish({
          type: "coin-detail-changed",
          exchangeId: 1,
          exchangeCryptocurrencyId: 10,
          cryptocurrencyId: 5
        })

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => symbolsOf(snapshot, 1).includes("SOL")),
          "added coin convergence"
        )

        expect(symbolsOf(yield* supervisor.snapshot, 1)).toEqual(["BTC", "ETH", "SOL"])

        yield* setRegistry(registry, 1, { slug: "dummy-ex", coins: [btc] })
        yield* events.publish({
          type: "coin-detail-changed",
          exchangeId: 1,
          exchangeCryptocurrencyId: 11,
          cryptocurrencyId: 6
        })

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => symbolsOf(snapshot, 1).join(",") === "BTC"),
          "removed coin convergence"
        )

        // Live subscription RPCs are queued; let the final unsubscribe settle before shutdown.
        yield* Effect.sleep(Duration.millis(100))
        yield* supervisor.stop(1)
      })
    )
  })

  test("ignores mapping changes for exchanges that are not running", async () => {
    const registry = Ref.makeUnsafe<Registry>(new Map([[1, { slug: "dummy-ex", coins: [btc] }]]))

    await runWithReconciler(
      registry,
      Effect.gen(function*() {
        const supervisor = yield* Supervisor
        const events = yield* DomainEvents

        yield* events.publish({
          type: "coin-detail-changed",
          exchangeId: 1,
          exchangeCryptocurrencyId: 10,
          cryptocurrencyId: 5
        })

        yield* Effect.sleep(Duration.millis(100))

        expect(yield* supervisor.isRunning(1)).toBe(false)
        expect(yield* supervisor.snapshot).toEqual([])
      })
    )
  })
})
