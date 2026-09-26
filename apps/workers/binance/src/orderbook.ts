import type { BootstrapCoin, CanonicalTick, PriceLevel } from "@lister/worker-contract"

import type { DepthSnapshot, DepthUpdateEvent } from "./binance.ts"

/**
 * Local order book for one subscribed pair.
 *
 * A book starts in the `ready === false` state while its REST snapshot is in
 * flight; depth updates arriving in that window are buffered and replayed once
 * the snapshot lands. Once `ready`, updates are applied directly using the
 * Binance gap/staleness rules.
 */
export interface LocalBook {
  /** The coin subscription driving this book. */
  readonly coin: BootstrapCoin
  /** Normalized Binance pair symbol (uppercase, no separator). */
  readonly symbol: string
  /** True once a snapshot has been applied; buffered deltas replay after that. */
  ready: boolean
  /** Update id of the book, used for gap and staleness detection. */
  lastUpdateId: number
  /** Price → quantity (order is restored when emitting via {@link topLevels}). */
  bids: Map<number, number>
  /** Price → quantity (order is restored when emitting via {@link topLevels}). */
  asks: Map<number, number>
  /** Depth updates received before the snapshot loaded. */
  buffer: ReadonlyArray<DepthUpdateEvent>
}

/**
 * A fresh book awaiting its first snapshot.
 *
 * @param coin - Coin the book belongs to.
 * @param symbol - Normalized Binance pair symbol.
 */
export const emptyBook = (coin: BootstrapCoin, symbol: string): LocalBook => ({
  coin,
  symbol,
  ready: false,
  lastUpdateId: 0,
  bids: new Map(),
  asks: new Map(),
  buffer: []
})

/**
 * Apply absolute depth levels to one side: zero quantity removes a level.
 *
 * @param side - Current side (`bids` or `asks`).
 * @param levels - Absolute `[price, quantity]` updates.
 */
export const applyLevels = (
  side: ReadonlyMap<number, number>,
  levels: ReadonlyArray<PriceLevel>
): Map<number, number> => {
  const next = new Map(side)

  for (const [price, quantity] of levels) {
    if (quantity === 0) {
      next.delete(price)
    } else {
      next.set(price, quantity)
    }
  }

  return next
}

/**
 * Outcome of applying one depth update to a ready book.
 */
export type ApplyEventResult =
  | { readonly kind: "ignored" }
  | { readonly kind: "resync" }
  | { readonly kind: "applied"; readonly book: LocalBook }

/**
 * Apply one depth update to a ready book.
 *
 * A stale event (`u < lastUpdateId`) is ignored; a gap (`U > lastUpdateId + 1`)
 * signals the caller to resynchronize from a fresh snapshot.
 *
 * @param book - The ready book.
 * @param event - The depth update.
 */
export const applyEvent = (book: LocalBook, event: DepthUpdateEvent): ApplyEventResult => {
  if (event.u < book.lastUpdateId) return { kind: "ignored" }

  if (event.U > book.lastUpdateId + 1) return { kind: "resync" }

  return {
    kind: "applied",
    book: {
      ...book,
      bids: applyLevels(book.bids, event.b),
      asks: applyLevels(book.asks, event.a),
      lastUpdateId: event.u
    }
  }
}

/**
 * Outcome of applying a snapshot to a buffering book.
 */
export type ApplySnapshotResult =
  | { readonly kind: "stale" }
  | { readonly kind: "applied"; readonly book: LocalBook }

/**
 * Apply a snapshot to a buffering book, replaying any buffered deltas.
 *
 * A snapshot that predates the first buffered update is stale and must be
 * re-fetched; otherwise the book becomes ready with the snapshot plus the
 * buffered deltas applied in order.
 *
 * @param book - The buffering book.
 * @param snapshot - The freshly fetched snapshot.
 */
export const applySnapshot = (book: LocalBook, snapshot: DepthSnapshot): ApplySnapshotResult => {
  const firstBuffered = book.buffer[0]

  if (firstBuffered !== undefined && snapshot.lastUpdateId < firstBuffered.U) {
    return { kind: "stale" }
  }

  let current: LocalBook = {
    ...book,
    bids: new Map(snapshot.bids.map(([price, quantity]): [number, number] => [price, quantity])),
    asks: new Map(snapshot.asks.map(([price, quantity]): [number, number] => [price, quantity])),
    lastUpdateId: snapshot.lastUpdateId
  }

  for (const event of book.buffer) {
    const result = applyEvent(current, event)

    if (result.kind === "applied") {
      current = result.book
    } else if (result.kind === "resync") {
      return { kind: "stale" }
    }
  }

  return { kind: "applied", book: { ...current, buffer: [], ready: true } }
}

/**
 * Best-first price levels for one side, capped at `limit`.
 *
 * @param side - Side to flatten (`bids` or `asks`).
 * @param order - `"desc"` for bids (highest first), `"asc"` for asks.
 * @param limit - Maximum number of levels to emit.
 */
export const topLevels = (
  side: ReadonlyMap<number, number>,
  order: "asc" | "desc",
  limit: number
): ReadonlyArray<PriceLevel> =>
  Array.from(side.entries())
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => (order === "desc" ? b - a : a - b))
    .slice(0, limit)
    .map(([price, quantity]): PriceLevel => [price, quantity])

/**
 * Build a canonical tick from a local book.
 *
 * @param book - The book to snapshot.
 * @param exchangeSlug - Exchange identity from argv.
 * @param timestamp - Epoch-millisecond timestamp.
 * @param depth - Maximum levels per side to emit.
 */
export const tickFor = (
  book: LocalBook,
  exchangeSlug: string,
  timestamp: number,
  depth: number
): CanonicalTick => ({
  exchangeSlug,
  symbol: book.coin.symbol,
  coingeckoId: book.coin.coingeckoId,
  bids: topLevels(book.bids, "desc", depth),
  asks: topLevels(book.asks, "asc", depth),
  timestamp
})
