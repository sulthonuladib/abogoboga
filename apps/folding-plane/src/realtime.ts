import { Clock, Duration, Effect, Option, Queue, Schema, Stream } from 'effect'
import { ManagedResource, Subscription } from 'foldkit'

import { ClientFrame, ServerEvent } from './api'
import { Message } from './message'
import type { Model } from './model'

// SOCKET

/**
 * The handle the event socket ManagedResource holds.
 *
 * It is a thin wrapper over a browser `WebSocket` with callback registration
 * that returns its own detach, so a Subscription can read and write without
 * depending on the DOM event-target shape.
 */
export interface EventSocket {
  readonly send: (frame: string) => void
  readonly close: () => void
  readonly subscribe: (handlers: {
    readonly onMessage: (data: string) => void
    readonly onClose: () => void
    readonly onError: () => void
  }) => () => void
}

/**
 * Identity of the app-wide event socket.
 */
export const SignalSocket = ManagedResource.tag<EventSocket>()('SignalSocket')

export type SignalSocketService = ManagedResource.ServiceOf<typeof SignalSocket>

const connectionTimeoutMs = 5000

const socketUrl = (): string => {
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'

  return `${protocol}//${globalThis.location.host}/api/events`
}

const wrapSocket = (socket: WebSocket): EventSocket => ({
  send: (frame) => socket.send(frame),
  close: () => socket.close(),
  subscribe: ({ onMessage, onClose, onError }) => {
    const handleMessage = (event: MessageEvent) => {
      onMessage(typeof event.data === 'string' ? event.data : String(event.data))
    }
    const handleClose = () => onClose()
    const handleError = () => onError()

    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)

    return () => {
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      socket.removeEventListener('error', handleError)
    }
  },
})

const acquireEventSocket = (): Effect.Effect<EventSocket, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<EventSocket>((resolve, reject) => {
        const socket = new WebSocket(socketUrl())

        socket.addEventListener('open', () => resolve(wrapSocket(socket)), { once: true })
        socket.addEventListener(
          'error',
          () => reject(new Error('the event socket failed to open')),
          { once: true },
        )
      }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error('the event socket failed to open'),
  }).pipe(
    Effect.timeout(Duration.millis(connectionTimeoutMs)),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(new Error('the event socket connection timed out')),
    ),
  )

// MANAGED RESOURCE

/**
 * The event socket is app-wide: its requirements do not depend on the route,
 * so it is acquired at boot and kept across in-app navigation. Re-acquisition
 * is driven by `socketGeneration`, which a reconnect bumps.
 */
export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  signalSocket: entry(Schema.Option(Schema.Struct({ generation: Schema.Int })), {
    resource: SignalSocket,
    modelToMaybeRequirements: (model) => Option.some({ generation: model.socketGeneration }),
    acquire: () => acquireEventSocket(),
    release: (socket) => Effect.sync(() => socket.close()),
    onAcquired: () => Message.SocketAcquired(),
    onReleased: () => Message.SocketReleased(),
    onAcquireError: (error) =>
      Message.SocketFailed({
        detail: error instanceof Error ? error.message : 'the event socket failed',
      }),
  }),
}))

// FRAMES

const ServerEventJson = Schema.fromJsonString(ServerEvent)
const ClientFrameJson = Schema.fromJsonString(ClientFrame)

const decodeServerEvent = Schema.decodeUnknownOption(ServerEventJson)
const encodeClientFrame = Schema.encodeSync(ClientFrameJson)

const sendFrame = (socket: EventSocket, frame: string): Effect.Effect<void> =>
  Effect.catchCause(
    Effect.sync(() => socket.send(frame)),
    () => Effect.void,
  )

const holdOpen = (
  onStart: Effect.Effect<void>,
  onEnd: Effect.Effect<void>,
): Stream.Stream<never> =>
  Stream.fromEffect(onStart).pipe(
    Stream.drain,
    Stream.concat(Stream.never),
    Stream.ensuring(onEnd),
  )

/**
 * The subscribe frame on start and the unsubscribe frame on teardown, with no
 * emitted Messages. A dependency change tears the stream down, which is what
 * makes leaving the signal route unsubscribe and a reconnect re-subscribe.
 */
export const signalFrameStream = (socket: EventSocket): Stream.Stream<Message> =>
  holdOpen(
    sendFrame(socket, encodeClientFrame({ type: 'subscribe', topic: 'signal' })),
    sendFrame(socket, encodeClientFrame({ type: 'unsubscribe', topic: 'signal' })),
  )

/**
 * Every server frame the socket delivers, decoded to a Message. A close or
 * error ends the stream and asks update to reconnect.
 */
export const eventMessageStream = (socket: EventSocket): Stream.Stream<Message> =>
  Stream.callback<Message>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        socket.subscribe({
          onMessage: (data) => {
            const decoded = decodeServerEvent(data)

            if (Option.isSome(decoded) && decoded.value.type === 'signal') {
              Queue.offerUnsafe(
                queue,
                Message.ReceivedSignalRows({ rows: decoded.value.rows }),
              )
            }
          },
          onClose: () => {
            Queue.offerUnsafe(queue, Message.SocketClosed())
            Queue.endUnsafe(queue)
          },
          onError: () => {
            Queue.offerUnsafe(queue, Message.SocketClosed())
            Queue.endUnsafe(queue)
          },
        })),
      (detach) => Effect.sync(detach),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

const socketMessagesStream = (): Stream.Stream<Message, never, SignalSocketService> =>
  Stream.unwrap(
    SignalSocket.get.pipe(
      Effect.map(eventMessageStream),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Stream.empty)),
    ),
  )

const signalTopicStream = (): Stream.Stream<Message, never, SignalSocketService> =>
  Stream.unwrap(
    SignalSocket.get.pipe(
      Effect.map(signalFrameStream),
      Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Stream.empty)),
    ),
  )

const tickStream = (): Stream.Stream<Message> =>
  Stream.tick('1 seconds').pipe(
    Stream.mapEffect(() =>
      Effect.map(
        Clock.currentTimeMillis,
        (now) => Message.TickedSignals({ now }),
      )),
  )

// SUBSCRIPTION

/**
 * The app-wide socket seam. Two socket entries gate on the connection, so a
 * released socket carries no listeners; the topic entry gates on the route, so
 * the server's projector only runs while a client is on the signal view.
 */
export const subscriptions = Subscription.make<Model, Message, SignalSocketService>()(
  (entry) => ({
    socketMessages: entry(
      { isConnected: Schema.Boolean },
      {
        modelToDependencies: (model) => ({ isConnected: model.connection._tag === 'Connected' }),
        dependenciesToStream: ({ isConnected }) =>
          isConnected ? socketMessagesStream() : Stream.empty,
      },
    ),
    signalTopic: entry(
      { isSignalRoute: Schema.Boolean, isConnected: Schema.Boolean, generation: Schema.Int },
      {
        modelToDependencies: (model) => ({
          isSignalRoute: model.route._tag === 'Signals',
          isConnected: model.connection._tag === 'Connected',
          generation: model.socketGeneration,
        }),
        dependenciesToStream: ({ isSignalRoute, isConnected }) =>
          isSignalRoute && isConnected ? signalTopicStream() : Stream.empty,
      },
    ),
    signalsTick: entry(
      { isSignalRoute: Schema.Boolean },
      {
        modelToDependencies: (model) => ({ isSignalRoute: model.route._tag === 'Signals' }),
        dependenciesToStream: ({ isSignalRoute }) =>
          isSignalRoute ? tickStream() : Stream.empty,
      },
    ),
  }),
)
