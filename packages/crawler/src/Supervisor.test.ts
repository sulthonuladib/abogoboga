import { describe, expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import type { BootstrapCoin, CanonicalTick } from "@lister/worker-contract"
import { workerArgvMarker } from "@lister/worker-contract"
import { Duration, Effect, Layer, Ref } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Supervisor, buildWorkerArgv, shardCoins, type ExchangeSnapshot } from "./Supervisor.ts"
import { DomainEvents } from "./WorkerEvents.ts"
import { sweepStaleWorkers } from "./Sweep.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const workerPath = (name: string): string =>
  name === "dummy"
    ? join(repoRoot, "packages/worker-contract/src/testing/dummy-worker.ts")
    : fileURLToPath(new URL(`./testing/${name}-worker.ts`, import.meta.url))

const dummyWorker = workerPath("dummy")

const crashWorker = workerPath("crash")

const cleanExitWorker = workerPath("clean-exit")

const platformLayer = Layer.mergeAll(DomainEvents.layer, BunServices.layer)

const coins = (count: number): ReadonlyArray<BootstrapCoin> =>
  Array.from({ length: count }, (_, index) => ({ symbol: `C${index + 1}`, coingeckoId: `coin-${index + 1}` }))

const btc: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

const runSupervisor = <A, E>(
  workerScript: string,
  program: (supervisor: Supervisor["Service"]) => Effect.Effect<A, E>
): Promise<A> =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor

    return yield* program(supervisor)
  }).pipe(
    Effect.provide(Supervisor.layer({ workerScript }).pipe(Layer.provide(platformLayer))),
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
    await runSupervisor(dummyWorker, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(1, "dummy-ex", coins(45))

        const started = yield* supervisor.snapshot

        expect(started.map((exchange) => exchange.exchangeId)).toEqual([1])
        expect(started[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20, 5])

        yield* supervisor.stop(1)

        expect(yield* supervisor.isRunning(1)).toBe(false)
        expect(yield* supervisor.snapshot).toEqual([])
      }))
  })

  test("first-fit fills spare capacity before spawning a shard", async () => {
    await runSupervisor(dummyWorker, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(2, "dummy-ex", coins(39))
        yield* supervisor.addCoins(2, [{ symbol: "NEW", coingeckoId: "new-coin" }])

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20])

        yield* supervisor.addCoins(2, [{ symbol: "EXTRA", coingeckoId: "extra-coin" }])

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20, 20, 1])
      }))
  })

  test("removing the last coin of a shard terminates it", async () => {
    await runSupervisor(dummyWorker, (supervisor) =>
      Effect.gen(function*() {
        const all = coins(21)

        yield* supervisor.start(3, "dummy-ex", all)

        const last = all[20]

        if (last === undefined) return yield* Effect.die(new Error("missing coin"))

        yield* supervisor.removeCoins(3, [last])

        expect((yield* supervisor.snapshot)[0]?.shards.map((shard) => shard.coins.length)).toEqual([20])
      }))
  })
})

describe("Supervisor lifecycle", () => {
  test("crash respawn replays the coin set and increments restarts", async () => {
    await runSupervisor(crashWorker, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(10, "crash-ex", [btc])

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => (shardOf(snapshot, 10)?.restarts ?? 0) >= 1),
          "shard respawn"
        )

        const shard = shardOf(yield* supervisor.snapshot, 10)

        expect(shard?.coins).toEqual([btc])
        expect(shard?.phase).toBe("backoff")
        expect(shard?.restarts).toBeGreaterThanOrEqual(1)
      }))
  })

  test("clean exit drops shard tracking", async () => {
    await runSupervisor(cleanExitWorker, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(11, "clean-exit-ex", [btc])

        yield* waitUntil(supervisor.isRunning(11).pipe(Effect.map((running) => !running)), "clean exit drop")

        expect(yield* supervisor.snapshot).toEqual([])
      }))
  })

  test("stop on a crash-looping shard cancels further respawns", async () => {
    await runSupervisor(crashWorker, (supervisor) =>
      Effect.gen(function*() {
        yield* supervisor.start(12, "crash-ex", [btc])

        yield* waitUntil(
          Effect.map(supervisor.snapshot, (snapshot) => (shardOf(snapshot, 12)?.restarts ?? 0) >= 1),
          "first respawn"
        )

        yield* supervisor.stop(12)

        expect(yield* supervisor.snapshot).toEqual([])

        yield* Effect.sleep(Duration.millis(400))

        expect(yield* supervisor.snapshot).toEqual([])
      }))
  })
})

describe("Supervisor tick forwarding", () => {
  test("decoded stdout ticks reach the handler", async () => {
    const ticks = Ref.makeUnsafe<ReadonlyArray<CanonicalTick>>([])

    const layer = Supervisor.layer({
      workerScript: dummyWorker,
      onTick: (tick: CanonicalTick) => Ref.update(ticks, (received) => [...received, tick])
    }).pipe(Layer.provide(platformLayer))

    const program: Effect.Effect<void, never, Supervisor> = Effect.gen(function*() {
      const supervisor = yield* Supervisor

      yield* supervisor.start(20, "dummy-ex", [btc]).pipe(Effect.orDie)

      yield* waitUntil(
        Effect.map(Ref.get(ticks), (received) => received.some((tick) => tick.symbol === "BTC")),
        "BTC tick"
      )

      yield* supervisor.stop(20)
    })

    await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))))
  })
})

describe("Supervisor boot sweep", () => {
  test("sweep terminates argv-signature orphans only", async () => {
    const orphan = Bun.spawn(
      ["bun", dummyWorker, workerArgvMarker, "orphan-ex", "shard-9", "BTC:bitcoin"],
      { stdin: "pipe", stdout: "ignore", stderr: "ignore" }
    )

    try {
      await Bun.sleep(250)

      const killed = await Effect.runPromise(
        sweepStaleWorkers().pipe(Effect.provide(BunServices.layer))
      )

      expect(killed).toContain(orphan.pid)

      await Promise.race([
        orphan.exited,
        Bun.sleep(5_000).then(() => {
          throw new Error("planted orphan was not swept")
        })
      ])
    } finally {
      try {
        orphan.kill(9)
      } catch {
        // Already reaped.
      }
    }
  })

  test("sweep matches marker argv and skips the current process", async () => {
    const killed: Array<number> = []

    const result = await Effect.runPromise(
      sweepStaleWorkers({
        list: Effect.succeed([
          { pid: 4242, args: `bun /worker.ts ${workerArgvMarker} ex shard-1 BTC:bitcoin` },
          { pid: 4343, args: "bun /server.ts" },
          { pid: 5555, args: `bun /worker.ts ${workerArgvMarker} self shard-1` }
        ]),
        kill: (pid) => Effect.sync(() => killed.push(pid)),
        selfPid: 5555
      }).pipe(Effect.provide(BunServices.layer))
    )

    expect(result).toEqual([4242])
    expect(killed).toEqual([4242])
  })
})

describe("Supervisor pure helpers", () => {
  test("shardCoins chunks at the capacity boundary", () => {
    expect(shardCoins(coins(19)).map((chunk) => chunk.length)).toEqual([19])
    expect(shardCoins(coins(45)).map((chunk) => chunk.length)).toEqual([20, 20, 5])
    expect(shardCoins(coins(0))).toEqual([])
  })

  test("buildWorkerArgv carries the marker signature and bootstrap coins", () => {
    expect(buildWorkerArgv("worker.ts", "indodax", "shard-3", [{ symbol: "BTC", coingeckoId: "bitcoin" }])).toEqual([
      "bun",
      "worker.ts",
      workerArgvMarker,
      "indodax",
      "shard-3",
      "BTC:bitcoin"
    ])
  })
})
