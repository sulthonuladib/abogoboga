import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { Duration, Effect, Layer, Ref, Scope, Stream } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Gate } from "./Gate.ts"
import { Supervisor, type ExchangeSnapshot } from "./Supervisor.ts"
import { DomainEvents, type DomainEvent } from "./WorkerEvents.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const dummyWorker = join(repoRoot, "packages/worker-contract/src/testing/dummy-rpc-worker.ts")

const base = Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform)

const supervisorProvided = Supervisor.layer({ workerScript: dummyWorker }).pipe(Layer.provide(base))

const dependencies = Layer.mergeAll(supervisorProvided, base)

const runWithGate = <A, E>(
  program: Effect.Effect<A, E, Gate | Supervisor | DomainEvents | Scope.Scope>
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(program.pipe(Effect.provide(Gate.layer.pipe(Layer.provideMerge(dependencies)))))
  )

const waitUntil = (check: Effect.Effect<boolean>, label: string): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (yield* check) return

      yield* Effect.sleep(Duration.millis(20))
    }

    return yield* Effect.die(new Error(`timed out waiting for ${label}`))
  })

const shardCount = (snapshot: ReadonlyArray<ExchangeSnapshot>, exchangeId: number): number =>
  snapshot.find((exchange) => exchange.exchangeId === exchangeId)?.shards.length ?? 0

const subscribedCount = (snapshot: ReadonlyArray<ExchangeSnapshot>, exchangeId: number): number =>
  (snapshot.find((exchange) => exchange.exchangeId === exchangeId)?.shards ?? []).reduce(
    (total, shard) => total + shard.coins.length,
    0
  )

const watchEvents = (): Effect.Effect<Ref.Ref<ReadonlyArray<DomainEvent>>, never, DomainEvents | Scope.Scope> =>
  Effect.gen(function*() {
    const bus = yield* DomainEvents
    const collected = yield* Ref.make<ReadonlyArray<DomainEvent>>([])

    yield* Effect.forkScoped(
      bus.subscribe.pipe(Stream.runForEach((event) => Ref.update(collected, (all) => [...all, event])))
    )

    yield* Effect.sleep(Duration.millis(20))

    return collected
  })

describe("Gate", () => {
  test("a single started exchange stays resident and inactive", async () => {
    await runWithGate(
      Effect.gen(function*() {
        const gate = yield* Gate
        const supervisor = yield* Supervisor

        yield* gate.start(1, "dummy-ex").pipe(Effect.orDie)

        expect(yield* gate.active).toEqual([])
        expect(yield* supervisor.isRunning(1)).toBe(true)
        expect(yield* supervisor.snapshot).toMatchObject([{ exchangeId: 1, shards: [{ coins: [] }] }])
      })
    )
  })

  test("a second exchange opens the gate and a third keeps all active", async () => {
    await runWithGate(
      Effect.gen(function*() {
        const gate = yield* Gate

        yield* gate.start(1, "dummy-ex").pipe(Effect.orDie)
        yield* gate.start(2, "other-ex").pipe(Effect.orDie)

        expect(yield* gate.active).toEqual([1, 2])

        yield* gate.start(3, "third-ex").pipe(Effect.orDie)

        expect(yield* gate.active).toEqual([1, 2, 3])

        yield* gate.stop(2)
        expect(yield* gate.active).toEqual([1, 3])
      })
    )
  })

  test("dropping below two pauses the survivor with a paused event", async () => {
    const events = await runWithGate(
      Effect.gen(function*() {
        const collected = yield* watchEvents()
        const gate = yield* Gate
        const supervisor = yield* Supervisor

        yield* gate.start(1, "dummy-ex").pipe(Effect.orDie)
        yield* gate.start(2, "other-ex").pipe(Effect.orDie)

        yield* gate.stop(2)

        yield* waitUntil(
          Effect.map(Ref.get(collected), (all) => all.some((event) => event.type === "paused")),
          "paused event"
        )

        expect(yield* gate.active).toEqual([])
        expect(yield* supervisor.isRunning(1)).toBe(true)
        expect(shardCount(yield* supervisor.snapshot, 1)).toBe(1)
        expect(subscribedCount(yield* supervisor.snapshot, 1)).toBe(0)

        return yield* Ref.get(collected)
      })
    )

    const paused = events.find((event) => event.type === "paused")

    expect(paused).toMatchObject({ type: "paused", exchangeId: 1, exchangeSlug: "dummy-ex" })
  })

  test("an explicit stop emits stopped, never paused", async () => {
    const events = await runWithGate(
      Effect.gen(function*() {
        const collected = yield* watchEvents()
        const gate = yield* Gate
        const supervisor = yield* Supervisor

        yield* gate.start(1, "dummy-ex").pipe(Effect.orDie)
        yield* gate.stop(1)

        expect(yield* supervisor.isRunning(1)).toBe(false)

        yield* waitUntil(
          Effect.map(Ref.get(collected), (all) => all.some((event) => event.type === "stopped")),
          "stopped event"
        )

        return yield* Ref.get(collected)
      })
    )

    const forExchange = events.filter((event) => "exchangeId" in event && event.exchangeId === 1)

    expect(forExchange.some((event) => event.type === "stopped")).toBe(true)
    expect(forExchange.some((event) => event.type === "paused")).toBe(false)
  })
})
