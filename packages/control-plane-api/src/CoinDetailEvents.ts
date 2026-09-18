import { Context, Effect, Layer, Schema } from "effect"

/**
 * Mutation kinds that can change an exchange's eligible coin set.
 */
export const CoinDetailChangeKind = Schema.Literals([
  "mapping-added",
  "mapping-updated",
  "mapping-removed",
  "chain-added",
  "chain-updated",
  "chain-removed"
])

/**
 * Mutation kinds that can change an exchange's eligible coin set.
 */
export type CoinDetailChangeKind = typeof CoinDetailChangeKind.Type

/**
 * One market/chain-link mutation that the reconciler must converge on.
 *
 * The payload identifies the affected rows only; subscription state is always
 * recomputed from the database, never trusted from the event.
 */
export const CoinDetailChange = Schema.Struct({
  kind: CoinDetailChangeKind,
  exchangeId: Schema.Int,
  cryptocurrencyId: Schema.Int,
  exchangeCryptocurrencyId: Schema.Int,
  chainId: Schema.optional(Schema.Int)
})

/**
 * One market/chain-link mutation that the reconciler must converge on.
 */
export type CoinDetailChange = typeof CoinDetailChange.Type

/**
 * Domain-event port for market and chain-link mutations.
 *
 * The JSON handlers publish through this port; the composition root wires it
 * to the crawler `DomainEvents` bus, and a no-op layer keeps isolated handler
 * tests free of the reconciler.
 */
export type CoinDetailEventsService = {
  /** Publish one mutation; publishing must never fail. */
  readonly publish: (change: CoinDetailChange) => Effect.Effect<void>
}

/**
 * Domain-event port for market and chain-link mutations.
 */
export class CoinDetailEvents extends Context.Service<CoinDetailEvents, CoinDetailEventsService>()(
  "lister/control-plane-api/CoinDetailEvents"
) {
  /**
   * No-op publisher for tests and for handler layers assembled without a
   * reconciler.
   */
  static readonly layerNoop = Layer.succeed(
    CoinDetailEvents,
    CoinDetailEvents.of({ publish: () => Effect.void })
  )
}
