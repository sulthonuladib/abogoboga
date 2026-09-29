import { Effect, Fiber, Option, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import type { SignalRow } from './api'
import { initialModel } from './model'
import { AppRoute } from './route'
import {
  type EventSocket,
  eventMessageStream,
  managedResources,
  signalFrameStream,
} from './realtime'

const row: SignalRow = {
  opportunityId: 1,
  symbol: 'BTC',
  buyExchangeId: 2,
  buyExchangeSymbol: 'BTC/IDR',
  buyPrice: 1_000_000,
  buyVolume: 2,
  buyTickTimestamp: 1_000,
  sellExchangeId: 3,
  sellExchangeSymbol: 'BTC/USDT',
  sellPrice: 1_100_000,
  sellVolume: 3,
  sellTickTimestamp: 1_000,
  profitPercent: 10,
  profitVolume: 0.2,
}

type FakeSocket = Readonly<{
  readonly frames: ReadonlyArray<string>
  readonly socket: EventSocket
  readonly push: (data: string) => void
  readonly drop: () => void
  readonly isSubscribed: () => boolean
}>

const fakeSocket = (): FakeSocket => {
  const frames: Array<string> = []
  let handlers:
    | { readonly onMessage: (data: string) => void, readonly onClose: () => void }
    | undefined

  const socket: EventSocket = {
    send: (frame) => {
      frames.push(frame)
    },
    close: () => {},
    subscribe: (next) => {
      handlers = { onMessage: next.onMessage, onClose: next.onClose }

      return () => {
        handlers = undefined
      }
    },
  }

  return {
    frames,
    socket,
    push: (data) => handlers?.onMessage(data),
    drop: () => handlers?.onClose(),
    isSubscribed: () => handlers !== undefined,
  }
}

const waitUntil = (predicate: () => boolean): Effect.Effect<void> =>
  Effect.gen(function*() {
    while (!predicate()) {
      yield* Effect.sleep('1 millis')
    }
  }).pipe(Effect.timeout('2 seconds'), Effect.orDie)

const parsedFrames = (frames: ReadonlyArray<string>): ReadonlyArray<unknown> =>
  frames.map((frame) => JSON.parse(frame))

const runTopicStream = (fake: FakeSocket): Promise<void> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        const fiber = yield* Effect.forkScoped(signalFrameStream(fake.socket).pipe(Stream.runDrain))

        yield* Effect.sleep('1 millis')
        yield* Fiber.interrupt(fiber)
      }),
    ),
  )

describe('signal socket resource', () => {
  test('its requirements do not depend on the route', () => {
    const onSignals = managedResources.signalSocket.modelToMaybeRequirements({
      ...initialModel,
      route: AppRoute.Signals({
        view: Option.none(),
        sort: Option.none(),
        threshold: Option.none(),
        hidden: Option.none(),
      }),
    })
    const onDashboard = managedResources.signalSocket.modelToMaybeRequirements({
      ...initialModel,
      route: AppRoute.Dashboard(),
    })

    expect(Option.isSome(onSignals)).toBe(true)
    expect(onSignals).toEqual(onDashboard)
  })
})

describe('signal topic frames', () => {
  test('subscribes on start and unsubscribes on teardown', async () => {
    const fake = fakeSocket()

    await runTopicStream(fake)

    expect(parsedFrames(fake.frames)).toEqual([
      { type: 'subscribe', topic: 'signal' },
      { type: 'unsubscribe', topic: 'signal' },
    ])
  })

  test('a reconnect unsubscribes the old stream and subscribes a new one', async () => {
    const fake = fakeSocket()

    await runTopicStream(fake)
    await runTopicStream(fake)

    expect(parsedFrames(fake.frames)).toEqual([
      { type: 'subscribe', topic: 'signal' },
      { type: 'unsubscribe', topic: 'signal' },
      { type: 'subscribe', topic: 'signal' },
      { type: 'unsubscribe', topic: 'signal' },
    ])
  })
})

describe('event message stream', () => {
  test('a pushed frame decodes to the signal Message', async () => {
    const fake = fakeSocket()

    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            eventMessageStream(fake.socket).pipe(Stream.take(1), Stream.runHead),
          )

          yield* waitUntil(fake.isSubscribed)
          fake.push(JSON.stringify({ type: 'signal', rows: [row] }))

          return yield* Fiber.join(fiber)
        }),
      ),
    )

    expect(Option.isSome(received)).toBe(true)

    const message = Option.getOrThrow(received)

    expect(message._tag).toBe('ReceivedSignalRows')
    expect(message._tag === 'ReceivedSignalRows' ? message.rows : []).toEqual([row])
  })

  test('a closed socket asks update to reconnect', async () => {
    const fake = fakeSocket()

    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const fiber = yield* Effect.forkChild(
            eventMessageStream(fake.socket).pipe(Stream.take(1), Stream.runHead),
          )

          yield* waitUntil(fake.isSubscribed)
          fake.drop()

          return yield* Fiber.join(fiber)
        }),
      ),
    )

    expect(Option.isSome(received)).toBe(true)
    expect(Option.getOrThrow(received)._tag).toBe('SocketClosed')
  })
})
