import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import type { BootstrapCoin, CanonicalTick } from "@lister/worker-contract"
import { Duration, Effect, Layer, Ref, Scope, Stream } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  Supervisor,
  shardCapacityFor,
  shardCoins,
  type ExchangeSnapshot,
  type SupervisorLayerOptions
} from "./Supervisor.ts"
import { DomainEvents, type WorkerEvent } from "./WorkerEvents.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const workerFixture = (name: string): string =>
  join(repoRoot, "packages/crawler/src/testing", `${name}-worker.ts`)

const dummyWorker = join(repoRoot, "packages/worker-contract/src/testing/dummy-rpc-worker.ts")

const throwingWorker = workerFixture("throwing")

const gracefulCloseWorker = workerFixture("graceful-close")

const reconnectingWorker = workerFixture("reconnecting")

const platformLayer = Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform)

const coins = (count: number): ReadonlyArray<BootstrapCoin> =>
  Array.from({ length: count }, (_, index) => ({ symbol: `C${index + 1}`, coingeckoId: `coin-${index + 1}` }))

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

const eth: BootstrapCoin = { symbol: "ETH", coingeckoId: "ethereum" }

const runSupervisor = <A, E>(
  options: SupervisorLayerOptions,
  program: (supervisor: Supervisor["Service"]) => Effect.Effect<A, E, DomainEvents | Scope.Scope>
): Promise<A> =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor

    return yield* program(supervisor)
  }).pipe(
    Effect.provide(Supervisor.layer(options).pipe(Layer.provideMerge(platformLayer))),
    Effect.scoped,
    Effect.runPromise
  )

const waitUntil = (check: Effect.Effect<boolean>, label: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (yield* check) return

      yield* Effect.sleep(Duration.millis(20))
    }

    return yield* Effect.die(new Error(`timed out waiting for ${label}`))
  })

const shardOf = (
  snapshot: ReadonlyArray<ExchangeSnapshot>,
  exchangeId: number,
  index = 0
): ExchangeSnapshot["shards"][number] | undefined =>
  snapshot.find((exchange) => exchange.exchangeId === exchangeId)?.shards[index]

describe("Supervisor shard placement", () => {
  test("chunks coins at capacity and drops tracking on stop", async () => {
    await runSupervisor({ workerScript: dummyWorker }, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(1, "dummy-ex", coins(45)).pipe(Effect.orDie)

        const started = yield* supervisor.snapshot

        expect(started.map((exchange) => exchange.exchangeId)).toEqual([1])
        expect(started[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20, 5])

        yield* supervisor.stop(1)

        expect(yield* supervisor.isRunning(1)).toBe(false)
        expect(yield* supervisor.snapshot).toEqual([])
      }))
  })

  test("first-fit fills spare capacity before spawning a shard", async () => {
    await runSupervisor({ workerScript: dummyWorker }, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(2, "dummy-ex", coins(39)).pipe(Effect.orDie)
        yield* supervisor.addCoins(2, [{ symbol: "NEW", coingeckoId: "new-coin" }]).pipe(Effect.orDie)

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20])

        yield* supervisor.addCoins(2, [{ symbol: "EXTRA", coingeckoId: "extra-coin" }]).pipe(Effect.orDie)

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20, 1])
      }))
  })

  test("removing the last coin of a shard terminates it", async () => {
    await runSupervisor({ workerScript: dummyWorker }, (supervisor) =>
      Effect.gen(function*() {
        const all = coins(21)

        yield* supervisor.start(3, "dummy-ex", all).pipe(Effect.orDie)

        const last = all[20]

        if (last === undefined) return yield* Effect.die(new Error("missing coin"))

        yield* supervisor.removeCoins(3, [last]).pipe(Effect.orDie)

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20])
        yield* supervisor.stop(3)
      }))
  })

  test("pause keeps one resident shard and addCoins refills it", async () => {
    await runSupervisor({ workerScript: dummyWorker }, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(20, "dummy-ex", coins(21)).pipe(Effect.orDie)

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 1])

        yield* supervisor.pause(20)

        expect(yield* supervisor.isRunning(20)).toBe(true)
        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([0])

        yield* supervisor.addCoins(20, [eth]).pipe(Effect.orDie)

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([1])
        expect((yield* supervisor.snapshot)[0]?.shards[0]?.coins.map((coin) => coin.symbol)).toEqual(["ETH"])

        yield* supervisor.stop(20)

        expect(yield* supervisor.snapshot).toEqual([])
      }))
  })

  test("live subscription commands update the worker's tick stream", async () => {
    const ticks = Ref.makeUnsafe<ReadonlyArray<CanonicalTick>>([])

    await runSupervisor(
      {
        workerScript: dummyWorker,
        onTick: (tick) => Ref.update(ticks, (received) => [...received, tick])
      },
      (supervisor) =>
        Effect.gen(function*() {
          yield* supervisor.start(4, "dummy-ex", [btc]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "BTC")),
            "bootstrap BTC tick"
          )

          yield* supervisor.addCoins(4, [eth]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "ETH")),
            "live ETH subscription"
          )

          yield* supervisor.removeCoins(4, [eth]).pipe(Effect.orDie)
          yield* Effect.sleep(Duration.millis(200))

          const afterUnsubscribe = yield* Ref.get(ticks).pipe(
            Effect.map((received) => received.filter((tick) => tick.symbol === "ETH").length)
          )

          yield* Effect.sleep(Duration.millis(200))

          const later = yield* Ref.get(ticks).pipe(
            Effect.map((received) => received.filter((tick) => tick.symbol === "ETH").length)
          )

          expect(later).toBe(afterUnsubscribe)
          yield* supervisor.stop(4)
        })
    )
  })
})

describe("Supervisor worker lifecycle", () => {
  test("safety-net recovery resumes streams with the current coin set", async () => {
    const spawned: Array<string> = []
    const ticks = Ref.makeUnsafe<ReadonlyArray<CanonicalTick>>([])

    const result = await runSupervisor(
      {
        workerScript: throwingWorker,
        workerScriptFor: () => {
          const script = spawned.length === 0 ? throwingWorker : dummyWorker

          spawned.push(script)

          return script
        },
        onTick: (tick) => Ref.update(ticks, (received) => [...received, tick])
      },
      (supervisor) =>
        Effect.gen(function*() {
          yield* supervisor.start(10, "defect-ex", [btc]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(supervisor.snapshot, (snapshot) => (shardOf(snapshot, 10)?.restarts ?? 0) >= 1),
            "first safety-net recovery"
          )

          yield* supervisor.addCoins(10, [eth]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.gen(function*() {
              const received = yield* Ref.get(ticks)
              const shard = shardOf(yield* supervisor.snapshot, 10)

              return shard?.phase === "running" && received.some((tick) => tick.symbol === "ETH")
            }),
            "ticks after worker recovery"
          )

          const snapshot = yield* supervisor.snapshot
          const received = yield* Ref.get(ticks)

          yield* supervisor.stop(10)

          return { snapshot, received }
        })
    )

    expect(spawned).toEqual([throwingWorker, dummyWorker])
    expect(shardOf(result.snapshot, 10)?.coins).toEqual([btc, eth])
    expect(result.received.some((tick) => tick.symbol === "ETH")).toBe(true)
  })

  test("stopping during worker recovery prevents another spawn", async () => {
    let spawnCount = 0

    await runSupervisor(
      {
        workerScript: throwingWorker,
        workerScriptFor: () => {
          spawnCount += 1

          return throwingWorker
        }
      },
      (supervisor) =>
        Effect.gen(function*() {
          yield* supervisor.start(11, "crash-loop-ex", [btc]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(supervisor.snapshot, (snapshot) => (shardOf(snapshot, 11)?.restarts ?? 0) >= 1),
            "pending worker recovery"
          )

          yield* supervisor.stop(11)
          const spawnsAtStop = spawnCount

          expect(yield* supervisor.snapshot).toEqual([])

          yield* Effect.sleep(Duration.millis(1_100))

          expect(spawnCount).toBe(spawnsAtStop)
        })
    )
  })

  test("reports worker reconnecting status and resumes ticks", async () => {
    const ticks = Ref.makeUnsafe<ReadonlyArray<CanonicalTick>>([])

    await runSupervisor(
      {
        workerScript: reconnectingWorker,
        onTick: (tick) => Ref.update(ticks, (received) => [...received, tick])
      },
      (supervisor) =>
        Effect.gen(function*() {
          const events = yield* DomainEvents
          const reconnectingEvents = Ref.makeUnsafe<ReadonlyArray<WorkerEvent>>([])

          yield* Effect.forkScoped(
            events.subscribe.pipe(
              Stream.filter((event): event is WorkerEvent => event.type === "reconnecting"),
              Stream.runForEach((event) =>
                Ref.update(reconnectingEvents, (received) => [...received, event])
              )
            )
          )

          yield* supervisor.start(12, "reconnecting-ex", [btc]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(supervisor.snapshot, (snapshot) => {
              const shard = shardOf(snapshot, 12)

              return shard?.phase === "reconnecting" && (shard.attempt ?? 0) >= 1
            }),
            "worker reconnecting status"
          )

          yield* waitUntil(
            Effect.map(Ref.get(reconnectingEvents), (received) => received.length > 0),
            "reconnecting lifecycle event"
          )

          yield* waitUntil(
            Effect.gen(function*() {
              const shard = shardOf(yield* supervisor.snapshot, 12)
              const received = yield* Ref.get(ticks)

              return shard?.phase === "running" && received.some((tick) => tick.symbol === "BTC")
            }),
            "ticks after worker reconnect"
          )

          const event = (yield* Ref.get(reconnectingEvents))[0]

          expect(event?.attempt).toBeGreaterThanOrEqual(1)
          yield* supervisor.stop(12)
        })
    )
  })

  test("publishes a running event when a shard recovers from reconnecting", async () => {
    await runSupervisor(
      { workerScript: reconnectingWorker },
      (supervisor) =>
        Effect.gen(function*() {
          const events = yield* DomainEvents
          const phases = Ref.makeUnsafe<ReadonlyArray<WorkerEvent["type"]>>([])

          yield* Effect.forkScoped(
            events.subscribe.pipe(
              Stream.filter(
                (event): event is WorkerEvent =>
                  event.type === "reconnecting" || event.type === "running"
              ),
              Stream.runForEach((event) =>
                Ref.update(phases, (seen) => [...seen, event.type])
              )
            )
          )

          yield* supervisor.start(15, "reconnecting-ex", [btc]).pipe(Effect.orDie)

          yield* waitUntil(
            Effect.map(Ref.get(phases), (seen) =>
              seen.includes("reconnecting") && seen.includes("running")
            ),
            "running event after reconnect"
          )

          yield* supervisor.stop(15)
        })
    )
  })

  test("gracefully closes a worker when an exchange stops", async () => {
    const ticks = Ref.makeUnsafe<ReadonlyArray<CanonicalTick>>([])

    await runSupervisor(
      {
        workerScript: gracefulCloseWorker,
        onTick: (tick) => Ref.update(ticks, (received) => [...received, tick])
      },
      (supervisor) =>
        Effect.gen(function*() {
          yield* supervisor.start(13, "graceful-close", [btc]).pipe(Effect.orDie)
          yield* waitUntil(
            Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "BTC")),
            "graceful-close worker tick"
          )
          yield* supervisor.stop(13)

          expect(yield* supervisor.snapshot).toEqual([])
        })
    )
  })

  test("tracks the local receipt time of shard ticks", async () => {
    await runSupervisor({ workerScript: dummyWorker }, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(14, "dummy-ex", [btc]).pipe(Effect.orDie)

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => {
            const lastTickAt = shardOf(snapshot, 14)?.lastTickAt

            return lastTickAt !== undefined && lastTickAt !== null
          }),
          "first shard tick receipt time"
        )

        const firstReceipt = shardOf(yield* supervisor.snapshot, 14)?.lastTickAt

        if (firstReceipt === undefined || firstReceipt === null) {
          return yield* Effect.die(new Error("missing first shard tick receipt time"))
        }

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => {
            const lastTickAt = shardOf(snapshot, 14)?.lastTickAt

            return lastTickAt !== undefined && lastTickAt !== null && lastTickAt > firstReceipt
          }),
          "newer shard tick receipt time"
        )

        const latestReceipt = shardOf(yield* supervisor.snapshot, 14)?.lastTickAt

        if (latestReceipt === undefined || latestReceipt === null) {
          return yield* Effect.die(new Error("missing latest shard tick receipt time"))
        }

        expect(firstReceipt).toBeGreaterThan(0)
        expect(latestReceipt).toBeGreaterThan(firstReceipt)

        yield* supervisor.stop(14)
      })
    )
  })
})

describe("Supervisor pure helpers", () => {
  test("shardCoins chunks at the capacity boundary", () => {
    expect(shardCoins(coins(19)).map((chunk) => chunk.length)).toEqual([19])
    expect(shardCoins(coins(45)).map((chunk) => chunk.length)).toEqual([20, 20, 5])
    expect(shardCoins(coins(0))).toEqual([])
  })

  test("shardCapacityFor resolves per-exchange limits with a default fallback", () => {
    expect(shardCapacityFor("binance")).toBe(100)
    expect(shardCapacityFor("gateio")).toBe(50)
    expect(shardCapacityFor("kucoin")).toBe(100)
    expect(shardCapacityFor("unknown")).toBe(20)
  })
})
