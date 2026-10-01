import { describe, expect, test } from "bun:test"
import { BunWorker } from "@effect/platform-bun"
import { DomainEvents, Gate, Supervisor } from "@lister/crawler"
import { Effect, Layer, Option, Stream } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
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

const supervisorProvided = Supervisor.layer({ workerScript: dummyWorker }).pipe(Layer.provide(base))

const gateProvided = Gate.layer.pipe(Layer.provide(Layer.mergeAll(supervisorProvided, base)))

const dependencies = Layer.mergeAll(supervisorProvided, base, directoryLayer, gateProvided)

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

describe("workers HttpApi over the live gate", () => {
  test("lone start stays resident with zero subscribed, then stops cleanly", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const initial = yield* client.workers.list()

        const started = yield* client.workers.start({ params: { exchangeId: 1 } })

        const duplicateStart = yield* Effect.flip(client.workers.start({ params: { exchangeId: 1 } }))
        const unknown = yield* Effect.flip(client.workers.start({ params: { exchangeId: 999 } }))

        const stopped = yield* client.workers.stop({ params: { exchangeId: 1 } })
        const duplicateStop = yield* Effect.flip(client.workers.stop({ params: { exchangeId: 1 } }))

        return { initial, started, duplicateStart, unknown, stopped, duplicateStop }
      })
    )

    expect(result.initial.map((status) => status.exchangeSlug)).toEqual(["dummy-ex", "other-ex"])
    expect(result.initial.every((status) => !status.running && status.desired === "stopped")).toBe(true)

    expect(result.started.running).toBe(true)
    expect(result.started.desired).toBe("started")
    expect(result.started.shards).toHaveLength(1)
    expect(result.started.subscribedCoins).toBe(0)

    expect(result.duplicateStart._tag).toBe("WorkerConflict")
    expect(result.unknown._tag).toBe("WorkerExchangeNotFound")
    expect(result.stopped.running).toBe(false)
    expect(result.stopped.desired).toBe("stopped")
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
