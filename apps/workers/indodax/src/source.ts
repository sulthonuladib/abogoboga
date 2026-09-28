import { emptySource, type WorkerSourceFactory } from "@lister/worker-contract"
import { Effect } from "effect"

/**
 * indodax worker owner hook.
 *
 * Exchange-specific order-book streaming belongs in this module; the shared
 * stdio host (`runStdioWorker` in `@lister/worker-contract`) drives it:
 *
 * - `initial` carries the bootstrap coins from the initial message, and
 *   `context` carries the bootstrap `exchangeSlug`/`shardId`.
 * - `subscribe`/`unsubscribe` arrive as live RPC commands; keep the
 *   subscription set in this module.
 * - every `ticks` value must be a `CanonicalTick`; the host writes each one
 *   as one tick over the `Ticks` RPC.
 *
 * This hook is currently a stub: the exchange implementation still lives in
 * `src/crawl-workers/subprocesses/indodax.ts` and has not been ported yet.
 */
export const source: WorkerSourceFactory = () => Effect.succeed(emptySource())
