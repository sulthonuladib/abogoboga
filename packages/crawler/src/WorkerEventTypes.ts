/**
 * Canonical worker lifecycle event vocabulary.
 *
 * This module carries no runtime dependency beyond plain data, so both the
 * crawler runtime and the browser-facing API contract can import it without
 * pulling server code into a client bundle.
 *
 * @module
 */

/**
 * Every kind of worker lifecycle event, in one place.
 */
export const workerEventTypeLiterals = [
  "started",
  "stopped",
  "paused",
  "shard-spawned",
  "shard-exited",
  "reconnecting",
  "reconciled"
] as const

/**
 * Kind of worker lifecycle event.
 */
export type WorkerEventType = (typeof workerEventTypeLiterals)[number]

/**
 * Lifecycle event kinds forwarded to monitoring clients.
 */
export const lifecycleTypes: ReadonlySet<string> = new Set(workerEventTypeLiterals)
