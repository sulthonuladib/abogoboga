/**
 * The event WebSocket route.
 *
 * A plain `HttpRouter` route upgrades a request to a `Socket.Socket`, then
 * tracks the connection's topic subscriptions: a subscribe frame starts
 * forwarding that topic's stream, an unsubscribe frame stops it, and the
 * connection's scope releases every stream when the socket closes. The route
 * sits beside the static SPA routes, so it shares the server without touching
 * the JSON API group.
 *
 * @module
 */

import {
  ClientFrame,
  ServerEvent,
  SignalProjector,
  type SignalProjectorService,
  type Topic,
  WorkersProjector,
  type WorkersProjectorService
} from "@lister/api"
import { Effect, Fiber, Match, Option, Queue, Ref, Schema, Stream } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Socket } from "effect/socket"

/**
 * Path the event socket is served on.
 */
export const eventSocketPath = "/api/events"

const ClientFrameJson = Schema.fromJsonString(ClientFrame)

const ServerEventJson = Schema.fromJsonString(ServerEvent)

const decodeClientFrame = Schema.decodeUnknownOption(ClientFrameJson)

const encodeServerEvent = Schema.encodeSync(ServerEventJson)

const topicStream = (
  signal: SignalProjectorService,
  workers: WorkersProjectorService,
  topic: Topic
): Stream.Stream<ServerEvent> =>
  Match.value(topic).pipe(
    Match.when("signal", () => signal.subscribe),
    Match.when("workers", () => workers.subscribe),
    Match.exhaustive
  )

/**
 * Run one upgraded connection until the socket closes.
 *
 * A single writer fiber drains an outbound queue, so subscription streams never
 * write to the socket concurrently. Each subscribed topic owns a scoped fiber;
 * interrupting it stops that topic without disturbing the others.
 */
const runEventSocket = (
  socket: Socket.Socket,
  signal: SignalProjectorService,
  workers: WorkersProjectorService
): Effect.Effect<void> =>
  Effect.scoped(
    Effect.gen(function*() {
      const writer = yield* socket.writer
      const outbound = yield* Queue.unbounded<string>()
      const subscriptions = yield* Ref.make(new Map<Topic, Fiber.Fiber<void, never>>())

      yield* Effect.forkScoped(
        Stream.fromQueue(outbound).pipe(
          Stream.runForEach((frame) => Effect.orDie(writer.write(frame)))
        )
      )

      const subscribeTopic = (topic: Topic) =>
        Effect.gen(function*() {
          const current = yield* Ref.get(subscriptions)

          if (current.has(topic)) {
            return
          }

          const fiber = yield* Effect.forkScoped(
            topicStream(signal, workers, topic).pipe(
              Stream.runForEach((event) => Queue.offer(outbound, encodeServerEvent(event))),
              Effect.orDie
            )
          )

          yield* Ref.update(subscriptions, (map) => new Map(map).set(topic, fiber))
        })

      const unsubscribeTopic = (topic: Topic) =>
        Effect.gen(function*() {
          const current = yield* Ref.get(subscriptions)
          const fiber = current.get(topic)

          if (fiber === undefined) {
            return
          }

          yield* Ref.update(subscriptions, (map) => {
            const next = new Map(map)
            next.delete(topic)

            return next
          })
          yield* Fiber.interrupt(fiber)
        })

      const handleFrame = (frame: ClientFrame) =>
        frame.type === "subscribe" ? subscribeTopic(frame.topic) : unsubscribeTopic(frame.topic)

      const pull = yield* Socket.readerString(socket)

      yield* Effect.forever(
        Effect.flatMap(pull, (chunks) =>
          Effect.forEach(chunks, (text) =>
            Option.match(decodeClientFrame(text), {
              onNone: () => Effect.void,
              onSome: handleFrame
            })
          )
        )
      ).pipe(Effect.catchTag("SocketError", () => Effect.void))
    })
  ).pipe(Effect.catchTag("SocketError", () => Effect.void))

const handleEventSocket: Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | SignalProjector | WorkersProjector
> = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const signal = yield* SignalProjector
  const workers = yield* WorkersProjector

  const upgraded = yield* request.upgrade.pipe(Effect.option)

  if (Option.isNone(upgraded)) {
    return HttpServerResponse.text("WebSocket upgrade required", { status: 426 })
  }

  yield* runEventSocket(upgraded.value, signal, workers)

  return HttpServerResponse.empty()
})

/**
 * The event WebSocket route, unprovided.
 *
 * Requires the hub's projector and the router it registers on.
 */
export const EventSocketRoute = HttpRouter.add("GET", eventSocketPath, handleEventSocket)
