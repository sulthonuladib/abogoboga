import { Context, Effect, Layer, Ref, Semaphore } from "effect"
import { Supervisor, type ShardChangeError } from "./Supervisor.ts"
import { DomainEvents, workerEvent } from "./WorkerEvents.ts"

interface GateState {
  /** Operator intent: exchange id to slug for every exchange that was started. */
  readonly desired: ReadonlyMap<number, string>
  /** Exchanges currently active: all desired exchanges, or none below two. */
  readonly active: ReadonlyArray<number>
}

/**
 * Crawl-gate coordinator: owns the operator's desired exchange set and the
 * two-exchange policy.
 *
 * An exchange is *active* when it is desired and at least two exchanges are
 * desired. Start and stop drive the {@link Supervisor}: a desired exchange
 * always keeps a resident shard, and becomes subscribed only once the gate
 * opens. Dropping below two pauses the survivors (one resident shard, zero
 * subscriptions) and publishes a `paused` event, distinct from the `stopped`
 * event an explicit operator stop produces.
 */
export class Gate extends Context.Service<Gate, {
  /** Whether the operator has started this exchange. */
  readonly isDesired: (exchangeId: number) => Effect.Effect<boolean>
  /** Exchanges the gate currently considers active, in id order. */
  readonly active: Effect.Effect<ReadonlyArray<number>>
  /**
   * Record operator intent to start an exchange, keep it resident, and open or
   * close the gate accordingly.
   */
  readonly start: (exchangeId: number, exchangeSlug: string) => Effect.Effect<void, ShardChangeError>
  /** Record operator intent to stop an exchange and converge the gate. */
  readonly stop: (exchangeId: number) => Effect.Effect<void>
}>()("lister/crawler/Gate") {
  /**
   * Scoped layer building the coordinator over the supervisor and event bus.
   */
  static readonly layer: Layer.Layer<Gate, never, Supervisor | DomainEvents> = Layer.effect(
    Gate,
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const events = yield* DomainEvents
      const state = yield* Ref.make<GateState>({ desired: new Map(), active: [] })
      const mutex = yield* Semaphore.make(1)

      const applyGate = Effect.fn("Gate.applyGate")(function*() {
        const current = yield* Ref.get(state)
        const desiredIds = [...current.desired.keys()].sort((a, b) => a - b)
        const nextActive = desiredIds.length >= 2 ? desiredIds : []
        const nextActiveSet = new Set(nextActive)
        const previouslyActive = new Set(current.active)
        const paused = [...previouslyActive].filter((exchangeId) => !nextActiveSet.has(exchangeId))

        yield* Ref.set(state, { desired: current.desired, active: nextActive })

        for (const exchangeId of paused) {
          const exchangeSlug = current.desired.get(exchangeId)

          if (exchangeSlug === undefined) continue

          if (!(yield* supervisor.isRunning(exchangeId))) continue

          yield* supervisor.pause(exchangeId)
          yield* events.publish(
            yield* workerEvent({
              type: "paused",
              exchangeId,
              exchangeSlug,
              shardId: null,
              message: `exchange ${exchangeSlug} paused below the two-exchange gate`
            })
          )
        }

        yield* events.publish({ type: "gate-changed", activeExchangeIds: nextActive })
      })

      const start = Effect.fn("Gate.start")(function*(exchangeId: number, exchangeSlug: string) {
        return yield* mutex.withPermits(1)(
          Effect.gen(function*() {
            const current = yield* Ref.get(state)

            if (current.desired.has(exchangeId)) return

            yield* Ref.set(state, {
              ...current,
              desired: new Map(current.desired).set(exchangeId, exchangeSlug)
            })

            if (!(yield* supervisor.isRunning(exchangeId))) {
              yield* supervisor.start(exchangeId, exchangeSlug, [])
            }

            yield* applyGate()
          })
        )
      })

      const stop = Effect.fn("Gate.stop")(function*(exchangeId: number) {
        return yield* mutex.withPermits(1)(
          Effect.gen(function*() {
            const current = yield* Ref.get(state)

            if (!current.desired.has(exchangeId)) return

            const desired = new Map(current.desired)

            desired.delete(exchangeId)

            yield* Ref.set(state, { ...current, desired })

            yield* supervisor.stop(exchangeId)
            yield* applyGate()
          })
        )
      })

      return Gate.of({
        isDesired: (exchangeId) => Effect.map(Ref.get(state), (current) => current.desired.has(exchangeId)),
        active: Effect.map(Ref.get(state), (current) => current.active),
        start,
        stop
      })
    })
  )
}
