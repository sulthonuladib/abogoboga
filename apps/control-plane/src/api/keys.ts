/**
 * Reactivity keys shared by queries and mutations.
 *
 * A mutation marks its key as changed; every query subscribed to that key
 * refetches. Keys name the data, not the endpoint, so a write to one resource
 * refreshes every view that reads it.
 *
 * @module
 */

/** Coin records, listing stats, and metadata. */
export const coinsKey = "coins"

/** Exchange records. */
export const exchangesKey = "exchanges"

/** Chain records. */
export const chainsKey = "chains"

/** Market assignments between coins and exchanges. */
export const marketsKey = "markets"

/** Chain links on market assignments. */
export const chainLinksKey = "chainLinks"

/** Crawler worker status. */
export const workersKey = "workers"
