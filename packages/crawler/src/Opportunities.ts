import { Context, type Effect } from "effect"

/**
 * Identity of one opportunity row: the coin and the ordered exchange pair.
 */
export interface OpportunityKey {
  /** Cryptocurrency the route trades. */
  readonly cryptocurrencyId: number
  /** Exchange value is bought on (and withdrawn from). */
  readonly buyExchangeId: number
  /** Exchange value is sold on (and deposited to). */
  readonly sellExchangeId: number
}

/**
 * One side's latest executable quote for a coin on one exchange.
 */
export interface OpportunitySideUpdate {
  /** Cryptocurrency the tick belongs to. */
  readonly cryptocurrencyId: number
  /** Exchange whose side of every matching row is updated. */
  readonly exchangeId: number
  /** Marginal price in IDR at the volume target. */
  readonly price: number
  /** Base amount accumulated to the volume target. */
  readonly volume: number
  /** Worker-supplied tick timestamp in epoch milliseconds. */
  readonly tickTimestamp: number
}

/**
 * One flush of coalesced side updates: every buy-side and sell-side update the
 * writer accumulated since the last flush.
 */
export interface OpportunitySidesWrite {
  /** Latest buy-side quote per `(cryptocurrencyId, exchangeId)`. */
  readonly buys: ReadonlyArray<OpportunitySideUpdate>
  /** Latest sell-side quote per `(cryptocurrencyId, exchangeId)`. */
  readonly sells: ReadonlyArray<OpportunitySideUpdate>
}

/**
 * Persistence port for the opportunity read model.
 *
 * `diffInit` converges the row set to database truth without disturbing prices
 * already written; `applySides` stamps a coalesced batch of ticks onto the rows
 * in one transaction so a flush costs a single commit.
 */
export type OpportunityStoreService = {
  /**
   * Insert every desired row that is missing at zero price/volume and delete
   * rows whose route vanished, leaving existing prices untouched.
   */
  readonly diffInit: (desired: ReadonlyArray<OpportunityKey>) => Effect.Effect<void>
  /**
   * Apply a batch of buy and sell side updates in one transaction.
   *
   * Each update is a simple `WHERE cryptocurrency_id = ? AND buy_exchange_id =
   * ?` (or the sell-side equivalent) statement; the transaction is the commit
   * boundary, so the whole flush shares one WAL fsync.
   */
  readonly applySides: (write: OpportunitySidesWrite) => Effect.Effect<void>
}

/**
 * Persistence port for the opportunity read model.
 */
export class OpportunityStore extends Context.Service<OpportunityStore, OpportunityStoreService>()(
  "lister/crawler/OpportunityStore"
) {}
