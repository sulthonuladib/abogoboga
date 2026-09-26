import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { DomainEvents, Eligibility, Supervisor } from "@lister/crawler"
import type { BootstrapCoin } from "@lister/worker-contract"
import { Duration, Effect, Layer, Option, Stream } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ExchangeDirectory } from "./WorkerControl.ts"
import { layerLive } from "./WorkerControlLive.ts"
import { WorkersHandlers } from "./WorkersHandlers.ts"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

const dummyWorker = join(repoRoot, "packages/worker-contract/src/testing/dummy-rpc-worker.ts")

const registry = [
  { exchangeId: 1, exchangeSlug: "dummy-ex" },
  { exchangeId: 2, exchangeSlug: "other-ex" }
] as const

const eligible: ReadonlyArray<BootstrapCoin> = [
  { symbol: "BTC", coingeckoId: "bitcoin" },
  { symbol: "ETH", coingeckoId: "ethereum" }
]

const eligibilityLayer = Layer.succeed(
  Eligibility,
  Eligibility.of({
    exchangeSlug: (exchangeId) =>
      Effect.succeed(
        Option.map(
          Option.fromIterable(registry.filter((entry) => entry.exchangeId === exchangeId)),
          (entry) => entry.exchangeSlug
        )
      ),
    coinsForExchange: (exchangeId) => Effect.succeed(exchangeId === 1 ? eligible : [])
  })
)

const directoryLayer = Layer.succeed(
  ExchangeDirectory,
  ExchangeDirectory.of({
    list: Effect.succeed(registry.map((entry) => ({ ...entry }))),
    find: (exchangeId) =>
      Effect.succeed(
        Option.map(
          Option.fromIterable(registry.filter((entry) => entry.exchangeId === exchangeId)),
          (entry) => ({ exchangeId: entry.exchangeId, exchangeSlug: entry.exchangeSlug })
        )
      )
  })
)

const base = Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform)

const dependencies = Layer.mergeAll(
  Supervisor.layer({ workerScript: dummyWorker }).pipe(Layer.provide(base)),
  base,
  eligibilityLayer,
  directoryLayer
)

const TestLayer = Layer.mergeAll(
  WorkersHandlers.pipe(Layer.provide(layerLive.pipe(Layer.provide(dependencies)))),
  HttpServer.layerServices
)

const makeClient = HttpApiTest.groups(Api, ["workers"])

type Client = Effect.Success<typeof makeClient>

const runWithClient = <A, E>(f: (client: Client) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const client = yield* makeClient

      return yield* f(client)
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

const waitFor = <A, E>(check: Effect.Effect<A, E>, predicate: (value: A) => boolean): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const value = yield* check

      if (predicate(value)) return value

      yield* Effect.sleep(Duration.millis(20))
    }

    return yield* Effect.die(new Error("timed out waiting for worker status"))
  })

describe("workers HttpApi over the live supervisor", () => {
  test("lists stopped exchanges, starts, conflicts, 404s, and stops", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const initial = yield* client.workers.list()

        const started = yield* client.workers.start({ params: { exchangeId: 1 } })

        const settled = yield* waitFor(
          client.workers.list(),
          (statuses) =>
            statuses[0]?.shards[0]?.phase === "running" && statuses[0]?.shards[0]?.lastTickAt !== null
        )

        const duplicateStart = yield* Effect.flip(client.workers.start({ params: { exchangeId: 1 } }))
        const unknown = yield* Effect.flip(client.workers.start({ params: { exchangeId: 999 } }))

        const stopped = yield* client.workers.stop({ params: { exchangeId: 1 } })
        const duplicateStop = yield* Effect.flip(client.workers.stop({ params: { exchangeId: 1 } }))

        return { initial, started, settled, duplicateStart, unknown, stopped, duplicateStop }
      })
    )

    expect(result.initial.map((status) => status.exchangeSlug)).toEqual(["dummy-ex", "other-ex"])
    expect(result.initial.every((status) => !status.running && status.desired === "stopped")).toBe(true)

    expect(result.started.running).toBe(true)
    expect(result.started.desired).toBe("started")
    expect(result.started.shards).toHaveLength(1)
    expect(result.started.eligibleCoins).toBe(2)
    expect(result.settled[0]?.shards[0]?.size).toBe(2)
    expect(result.settled[0]?.shards[0]?.lastTickAt).toBeGreaterThan(0)

    expect(result.duplicateStart._tag).toBe("WorkerConflict")
    expect(result.unknown._tag).toBe("WorkerExchangeNotFound")
    expect(result.stopped.running).toBe(false)
    expect(result.duplicateStop._tag).toBe("WorkerConflict")
  })

  test("SSE stream forwards supervisor lifecycle events", async () => {
    const events = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.workers.start({ params: { exchangeId: 2 } })

        const stream = yield* client.workers.events()
        const chunk = yield* stream.pipe(Stream.take(1), Stream.runCollect)

        return [...chunk]
      })
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "started", exchangeId: 2, exchangeSlug: "other-ex" })
  })
})
