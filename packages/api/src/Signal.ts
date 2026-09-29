import { Context, type Effect, Schema } from "effect"

/**
 * One fresh, profitable cross-exchange arbitrage opportunity as sent to a
 * subscribed client.
 *
 * The row is self-contained: it carries both exchange symbols and both tick
 * timestamps, so a client renders it without a second lookup and can re-check
 * its age against its own clock between snapshots.
 */
export const SignalRow = Schema.Struct({
  opportunityId: Schema.Int,
  symbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  buyExchangeId: Schema.Int,
  buyExchangeSymbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  buyPrice: Schema.Finite,
  buyVolume: Schema.Finite,
  buyTickTimestamp: Schema.Int,
  sellExchangeId: Schema.Int,
  sellExchangeSymbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  sellPrice: Schema.Finite,
  sellVolume: Schema.Finite,
  sellTickTimestamp: Schema.Int,
  profitPercent: Schema.Finite,
  profitVolume: Schema.Finite
})

/**
 * One fresh, profitable cross-exchange arbitrage opportunity as sent to a
 * subscribed client.
 */
export type SignalRow = typeof SignalRow.Type

/**
 * The `signal` server event: a complete, unranked snapshot of every eligible
 * row.
 *
 * The snapshot carries no floor and no ranking, so the client owns the
 * threshold, the sort key, and exchange hiding.
 */
export const SignalEvent = Schema.Struct({
  type: Schema.Literal("signal"),
  rows: Schema.Array(SignalRow)
})

/**
 * The `signal` server event: a complete, unranked snapshot of every eligible
 * row.
 */
export type SignalEvent = typeof SignalEvent.Type

/**
 * Every message the server pushes to a subscribed client.
 *
 * The union is discriminated on `type`; adding a later event type is one more
 * member, not a protocol change.
 */
export const ServerEvent = Schema.Union([SignalEvent])

/**
 * Every message the server pushes to a subscribed client.
 */
export type ServerEvent = typeof ServerEvent.Type

/**
 * Freshness window applied to both tick timestamps, in milliseconds.
 */
export const freshnessWindowMs = 5000

/**
 * Persistence port for the signal projection.
 *
 * Implemented by a Drizzle adapter over the `Database` service, so tests can
 * seed an in-memory database and exercise the real query.
 */
export type SignalStoreService = {
  /**
   * Project every opportunity whose sides are fresh on the server clock and
   * profitable, with no floor and no limit.
   */
  readonly project: Effect.Effect<ReadonlyArray<SignalRow>>
}

/**
 * Persistence port for the signal projection.
 */
export class SignalStore extends Context.Service<SignalStore, SignalStoreService>()(
  "lister/control-plane-api/SignalStore"
) {}
