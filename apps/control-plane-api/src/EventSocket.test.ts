import { describe, expect, test } from "bun:test"
import { BunHttpServer } from "@effect/platform-bun"
import {
  type ClientFrame,
  EventChannel,
  type EventChannelService,
  SignalProjector,
  SignalStore,
  type SignalRow
} from "@lister/api"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { EventSocketRoute, eventSocketPath } from "./EventSocket.ts"

const row: SignalRow = {
  opportunityId: 1,
  symbol: "BTC",
  buyExchangeId: 2,
  buyExchangeSymbol: "BTC/IDR",
  buyPrice: 1_000_000,
  buyVolume: 2,
  buyTickTimestamp: 1,
  sellExchangeId: 3,
  sellExchangeSymbol: "BTC/USDT",
  sellPrice: 1_100_000,
  sellVolume: 3,
  sellTickTimestamp: 2,
  profitPercent: 10,
  profitVolume: 0.2
}

const storeLayer = Layer.succeed(
  SignalStore,
  SignalStore.of({ project: Effect.succeed([row]) })
)

const shared = Layer.mergeAll(EventChannel.layer, storeLayer)

const dependencies = Layer.mergeAll(
  shared,
  SignalProjector.layer.pipe(Layer.provide(shared)),
  BunHttpServer.layerTest
)

type Harness = Readonly<{
  readonly httpUrl: string
  readonly wsUrl: string
}>

const withServer = <A, E>(
  program: (harness: Harness) => Effect.Effect<A, E, EventChannel | SignalProjector>
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const server = yield* HttpServer.HttpServer
      const handler = yield* HttpRouter.toHttpEffect(EventSocketRoute)

      yield* Effect.forkScoped(server.serve(handler))

      const httpUrl = HttpServer.formatAddress(server.address)

      return yield* program({ httpUrl, wsUrl: httpUrl.replace(/^http/, "ws") })
    }).pipe(Effect.provide(dependencies), Effect.scoped)
  )

const connect = (url: string): Effect.Effect<WebSocket> =>
  Effect.callback((resume) => {
    const socket = new WebSocket(url)

    const onOpen = () => {
      socket.removeEventListener("error", onError)
      resume(Effect.succeed(socket))
    }

    const onError = () => {
      socket.removeEventListener("open", onOpen)
      resume(Effect.die(new Error("event socket failed to open")))
    }

    socket.addEventListener("open", onOpen)
    socket.addEventListener("error", onError)

    return Effect.sync(() => {
      socket.removeEventListener("open", onOpen)
      socket.removeEventListener("error", onError)
    })
  })

const receive = (socket: WebSocket): Effect.Effect<string> =>
  Effect.callback((resume) => {
    const onMessage = (event: MessageEvent) => {
      socket.removeEventListener("message", onMessage)
      resume(Effect.succeed(String(event.data)))
    }

    socket.addEventListener("message", onMessage)

    return Effect.sync(() => socket.removeEventListener("message", onMessage))
  })

const sendFrame = (socket: WebSocket, frame: ClientFrame): Effect.Effect<void> =>
  Effect.sync(() => socket.send(JSON.stringify(frame)))

const waitForSubscribers = (channel: EventChannelService, expected: number): Effect.Effect<void> =>
  Effect.gen(function*() {
    let attempts = 0

    while (true) {
      const count = yield* channel.count("signal")

      if (count === expected) {
        return
      }

      if (attempts > 200) {
        return yield* Effect.die(new Error(`subscriber count did not reach ${expected}`))
      }

      attempts++
      yield* Effect.sleep("10 millis")
    }
  })

describe("event socket route", () => {
  test("rejects a plain request and opens a real upgrade", async () => {
    const result = await withServer(({ httpUrl, wsUrl }) =>
      Effect.gen(function*() {
        const response = yield* Effect.promise(() => fetch(httpUrl + eventSocketPath))
        const socket = yield* connect(wsUrl + eventSocketPath)
        const open = socket.readyState
        socket.close()

        return { status: response.status, open }
      }))

    expect(result.status).toBe(426)
    expect(result.open).toBe(WebSocket.OPEN)
  })

  test("subscribe delivers a signal event and unsubscribe stops it", async () => {
    const result = await withServer(({ wsUrl }) =>
      Effect.gen(function*() {
        const socket = yield* connect(wsUrl + eventSocketPath)

        yield* sendFrame(socket, { type: "subscribe", topic: "signal" })
        const first = yield* receive(socket)

        yield* sendFrame(socket, { type: "unsubscribe", topic: "signal" })
        const afterUnsubscribe = yield* receive(socket).pipe(Effect.timeoutOption("150 millis"))

        socket.close()

        return { first: JSON.parse(first), afterUnsubscribe }
      }))

    expect(result.first.type).toBe("signal")
    expect(result.first.rows).toHaveLength(1)
    expect(Option.isNone(result.afterUnsubscribe)).toBe(true)
  })

  test("closing the socket releases the connection's subscriptions", async () => {
    const result = await withServer(({ wsUrl }) =>
      Effect.gen(function*() {
        const channel = yield* EventChannel
        const socket = yield* connect(wsUrl + eventSocketPath)

        yield* sendFrame(socket, { type: "subscribe", topic: "signal" })
        yield* receive(socket)
        yield* waitForSubscribers(channel, 1)

        socket.close()
        yield* waitForSubscribers(channel, 0)

        return yield* channel.count("signal")
      }))

    expect(result).toBe(0)
  })
})
