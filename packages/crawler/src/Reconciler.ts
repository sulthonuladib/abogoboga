import { type BootstrapCoin } from "@lister/worker-contract"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { coinKey, Supervisor, type ShardChangeError } from "./Supervisor.ts"
import { DomainEvents, workerEvent, type DomainEvent } from "./WorkerEvents.ts"

/**
 * Expected failure surfaced by {@link Reconciler.reconcile} when a shard cannot
 * be spawned or written to while converging.
 */
export type ReconcilerError = ShardChangeError

/**
 * Exchange facts the reconciler needs from persistence.
 *
 * Every call reads current database truth; implementations must not cache, so a
 * reconciliation always observes the latest mappings.
 */
export type EligibilityService = {
  /** Slug of an exchange, or `None` when the id does not exist. */
  readonly exchangeSlug: (exchangeId: number) => Effect.Effect<Option.Option<string>>
  /** Coins currently eligible for subscription on an exchange. */
  readonly coinsForExchange: (exchangeId: number) => Effect.Effect<ReadonlyArray<BootstrapCoin>>
}

/**
 * Persistence port backing {@link Reconciler}.
 *
 * The concrete Drizzle adapter lives in `EligibilityStore.ts`; the reconciler
 * depends only on this application-owned contract so tests can substitute an
 * in-memory registry.
 */
export class Eligibility extends Context.Service<Eligibility, EligibilityService>()(
  "lister/crawler/Eligibility"
) {}

/**
 * Converges running exchange workers to database truth.
 *
 * The reconciler subscribes to {@link DomainEvents} and reacts to operator
 * intent (`worker-changed`) and mapping mutations (`coin-detail-changed`).
 * Subscription state is always recomputed from the {@link Eligibility} port on
 * every event; event payloads are never trusted. Exchanges that are not running
 * are ignored, so a stale event cannot start a worker.
 */
export class Reconciler extends Context.Service<Reconciler, {
  /**
   * Recompute one running exchange's shard set from database truth.
   *
   * A no-op when the exchange is not running. Coins no longer eligible are
   * unsubscribed and emptied shards terminated; newly eligible coins are added.
   */
  readonly reconcile: (exchangeId: number) => Effect.Effect<void, ReconcilerError>
}>()("lister/crawler/Reconciler") {
  /**
   * Layer that forks the reconciliation fiber and exposes {@link Reconciler}.
   *
   * The fiber lives in the layer's scope, so closing the layer stops event
   * processing. Event handling failures are logged and never stop the loop.
   */
  static readonly layer: Layer.Layer<Reconciler, never, Supervisor | DomainEvents | Eligibility> = Layer.effect(
    Reconciler,
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const events = yield* DomainEvents
      const eligibility = yield* Eligibility

      const reconcile = Effect.fn("Reconciler.reconcile")(function*(exchangeId: number) {
        if (!(yield* supervisor.isRunning(exchangeId))) return

        const eligible = yield* eligibility.coinsForExchange(exchangeId)
        const snapshot = yield* supervisor.snapshot
        const exchange = snapshot.find((candidate) => candidate.exchangeId === exchangeId)

        if (exchange === undefined) return

        const want = new Map(eligible.map((coin) => [coinKey(coin), coin]))
        const have = new Map<string, BootstrapCoin>()

        for (const shard of exchange.shards) {
          for (const coin of shard.coins) {
            have.set(coinKey(coin), coin)
          }
        }

        const toAdd = Array.from(want.values()).filter((coin) => !have.has(coinKey(coin)))
        const toRemove = Array.from(have.values()).filter((coin) => !want.has(coinKey(coin)))

        if (toRemove.length > 0) {
          yield* supervisor.removeCoins(exchangeId, toRemove)
        }

        if (toAdd.length > 0) {
          yield* supervisor.addCoins(exchangeId, toAdd)
        }

        yield* events.publish(
          yield* workerEvent({
            type: "reconciled",
            exchangeId,
            exchangeSlug: exchange.exchangeSlug,
            shardId: null,
            message: `reconciled ${exchange.exchangeSlug}: +${toAdd.length} -${toRemove.length}`
          })
        )
      })

      const start = Effect.fnUntraced(function*(exchangeId: number) {
        if (yield* supervisor.isRunning(exchangeId)) return

        const slug = yield* eligibility.exchangeSlug(exchangeId)

        if (Option.isNone(slug)) return

        const coins = yield* eligibility.coinsForExchange(exchangeId)

        yield* supervisor.start(exchangeId, slug.value, coins)
      })

      const handle = (event: DomainEvent): Effect.Effect<void, ReconcilerError> =>
        Effect.gen(function*() {
          if (event.type === "worker-changed") {
            if (event.action === "stop") {
              yield* supervisor.stop(event.exchangeId)

              return
            }

            yield* start(event.exchangeId)

            return
          }

          if (event.type === "coin-detail-changed") {
            yield* reconcile(event.exchangeId)
          }
        })

      yield* Effect.forkScoped(
        events.subscribe.pipe(
          Stream.runForEach(handle),
          Effect.catchCause((cause) => Effect.logError("reconciler: event handling failed", cause))
        )
      )

      return Reconciler.of({ reconcile })
    })
  )
}
