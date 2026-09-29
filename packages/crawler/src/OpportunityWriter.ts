import { Context, Duration, Effect, Layer, Ref } from "effect"
import { OpportunityStore, type OpportunitySideUpdate, type OpportunitySidesWrite } from "./Opportunities.ts"

/**
 * Default interval between coalesced flushes, in milliseconds.
 */
export const defaultFlushIntervalMillis = 500 as const

const sideKey = (update: OpportunitySideUpdate): string => `${update.cryptocurrencyId}:${update.exchangeId}`

/**
 * Coalesces tick side updates before they reach the database.
 *
 * Each tick records the latest buy and sell quote for its
 * `(cryptocurrencyId, exchangeId)`; the map overwrites, so only the newest value
 * per key survives. A background fiber flushes the pending keys on an interval
 * — and once more on shutdown — applying the whole batch in one transaction
 * (`OpportunityStore.applySides`). The result is a single commit per flush
 * instead of one per tick, which keeps the connection pool free for reads.
 *
 * The matrices lag by at most one flush interval; a tick for a coin with no
 * opportunity rows still records and flushes, updating nothing.
 */
export class OpportunityWriter extends Context.Service<OpportunityWriter, {
  /** Record the latest buy-side quote for a coin on an exchange. */
  readonly recordBuy: (update: OpportunitySideUpdate) => Effect.Effect<void>
  /** Record the latest sell-side quote for a coin on an exchange. */
  readonly recordSell: (update: OpportunitySideUpdate) => Effect.Effect<void>
  /** Apply every pending update now, draining the buffers. */
  readonly flush: Effect.Effect<void>
}>()("lister/crawler/OpportunityWriter") {
  /**
   * Scoped layer that forks the flush fiber over {@link OpportunityStore}.
   *
   * @param options - Flush interval override, in milliseconds.
   */
  static readonly layer = (
    options?: { readonly flushIntervalMillis?: number }
  ): Layer.Layer<OpportunityWriter, never, OpportunityStore> =>
    Layer.effect(
      OpportunityWriter,
      Effect.gen(function*() {
        const store = yield* OpportunityStore
        const buys = yield* Ref.make<Map<string, OpportunitySideUpdate>>(new Map())
        const sells = yield* Ref.make<Map<string, OpportunitySideUpdate>>(new Map())
        const interval = options?.flushIntervalMillis ?? defaultFlushIntervalMillis

        const record = (ref: Ref.Ref<Map<string, OpportunitySideUpdate>>, update: OpportunitySideUpdate) =>
          Ref.update(ref, (current) => {
            // Mutating in place is safe: the callback is synchronous and the
            // flush swaps the whole map out atomically with `getAndSet`.
            current.set(sideKey(update), update)

            return current
          })

        const flush = Effect.fn("OpportunityWriter.flush")(function*() {
          const pendingBuys = [...(yield* Ref.getAndSet(buys, new Map())).values()]
          const pendingSells = [...(yield* Ref.getAndSet(sells, new Map())).values()]

          if (pendingBuys.length === 0 && pendingSells.length === 0) return

          const write: OpportunitySidesWrite = { buys: pendingBuys, sells: pendingSells }

          yield* store.applySides(write)
        })

        const safeFlush = flush().pipe(
          Effect.catchCause((cause) => Effect.logError("opportunity writer: flush failed", cause))
        )

        yield* Effect.forkScoped(
          Effect.forever(
            Effect.flatMap(Effect.sleep(Duration.millis(interval)), () => safeFlush)
          )
        )

        yield* Effect.addFinalizer(() => safeFlush)

        return OpportunityWriter.of({
          recordBuy: (update) => record(buys, update),
          recordSell: (update) => record(sells, update),
          flush: flush()
        })
      })
    )
}
