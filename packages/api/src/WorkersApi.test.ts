import { describe, expect, test } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { HttpServer } from "effect/unstable/http"
import { HttpApiTest } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { WorkerConflict, WorkerControl, WorkerExchangeNotFound } from "./WorkerControl.ts"
import { WorkersHandlers } from "./WorkersHandlers.ts"

const ExchangeRegistry = [
  { id: 1, slug: "indodax" },
  { id: 2, slug: "binance" }
] as const

const TestLayer = Layer.mergeAll(
  WorkersHandlers.pipe(Layer.provide(WorkerControl.layerTest(ExchangeRegistry))),
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

describe("workers HttpApi", () => {
  test("lists every exchange with desired and actual state", async () => {
    const statuses = await runWithClient((client) => client.workers.list())

    expect(statuses).toHaveLength(2)
    expect(statuses.map((status) => status.exchangeSlug)).toEqual(["indodax", "binance"])
    expect(statuses.every((status) => !status.running && status.desired === "stopped")).toBe(true)
    expect(statuses[0]?.shards).toEqual([])
  })

  test("start/stop transition, conflict, and 404 semantics", async () => {
    const result = await runWithClient((client) =>
      Effect.gen(function*() {
        const started = yield* client.workers.start({ params: { exchangeId: 1 } })
        const duplicateStart = yield* Effect.flip(client.workers.start({ params: { exchangeId: 1 } }))
        const unknown = yield* Effect.flip(client.workers.start({ params: { exchangeId: 999 } }))
        const stopped = yield* client.workers.stop({ params: { exchangeId: 1 } })
        const duplicateStop = yield* Effect.flip(client.workers.stop({ params: { exchangeId: 1 } }))

        return { started, duplicateStart, unknown, stopped, duplicateStop }
      })
    )

    expect(result.started.running).toBe(true)
    expect(result.started.desired).toBe("started")
    expect(result.started.shards).toHaveLength(1)
    expect(result.started.eligibleCoins).toBeGreaterThan(0)
    expect(result.duplicateStart).toBeInstanceOf(WorkerConflict)
    expect(result.unknown).toBeInstanceOf(WorkerExchangeNotFound)
    expect(result.stopped.running).toBe(false)
    expect(result.duplicateStop).toBeInstanceOf(WorkerConflict)
  })

  test("SSE stream replays lifecycle events to late subscribers", async () => {
    const events = await runWithClient((client) =>
      Effect.gen(function*() {
        yield* client.workers.start({ params: { exchangeId: 2 } })

        const stream = yield* client.workers.events()
        const chunk = yield* stream.pipe(Stream.take(1), Stream.runCollect)

        return [...chunk]
      })
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "started", exchangeId: 2, exchangeSlug: "binance" })
  })
})
