import { Context, Effect, Layer, Stream } from "effect"
import { Gate } from "./Gate.ts"
import { OpportunityStore } from "./Opportunities.ts"
import { Eligibility } from "./Reconciler.ts"
import { DomainEvents } from "./WorkerEvents.ts"

/**
 * Converges the opportunity read model to database truth.
 *
 * The reconciler recomputes the full desired row set from the route scan and
 * applies a diff: missing routes are inserted at zero price/volume, vanished
 * routes are deleted, and rows that already carry prices are left untouched. It
 * runs when the active exchange set changes and when coin detail changes, so a
 * metadata edit never blanks live prices. Event handling failures are logged
 * and never stop the loop.
 */
export class OpportunityReconciler extends Context.Service<OpportunityReconciler, {
  /** Recompute and diff the opportunity rows for the current active set. */
  readonly reconcile: Effect.Effect<void>
}>()("lister/crawler/OpportunityReconciler") {
  /**
   * Layer that forks the reconciliation fiber and exposes the service.
   */
  static readonly layer: Layer.Layer<
    OpportunityReconciler,
    never,
    DomainEvents | Eligibility | Gate | OpportunityStore
  > = Layer.effect(
    OpportunityReconciler,
    Effect.gen(function*() {
      const events = yield* DomainEvents
      const eligibility = yield* Eligibility
      const gate = yield* Gate
      const store = yield* OpportunityStore

      const reconcile = Effect.fn("OpportunityReconciler.reconcile")(function*() {
        const active = yield* gate.active
        const pairs = yield* eligibility.pairsFor(active)

        yield* store.diffInit(pairs)
      })

      yield* Effect.forkScoped(
        events.subscribe.pipe(
          Stream.runForEach((event) => {
            if (event.type !== "gate-changed" && event.type !== "coin-detail-changed") return Effect.void

            return reconcile()
          }),
          Effect.catchCause((cause) => Effect.logError("opportunity reconciler: event handling failed", cause))
        )
      )

      return OpportunityReconciler.of({ reconcile: reconcile() })
    })
  )
}
