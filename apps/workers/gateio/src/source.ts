import { emptySource, type WorkerSourceFactory } from "@lister/worker-contract"
import { Effect } from "effect"

/**
 * gateio worker owner hook.
 *
 * Exchange-specific order-book streaming belongs in this module; the shared
 * stdio host (`runStdioWorker` in `@lister/worker-contract`) drives it:
 *
 * - `initial` carries the bootstrap coins already decoded from argv, and
 *   `context` carries the argv `exchangeSlug`/`shardId`.
 * - `subscribe`/`unsubscribe` arrive as live stdin commands; keep the
 *   subscription set in this module.
 * - every `ticks` value must be a `CanonicalTick`; the host writes each one
 *   as a single JSON line on stdout.
 *
 * This hook is currently a stub: the exchange implementation still lives in
 * `src/crawl-workers/subprocesses/gateio.ts` and has not been ported yet.
 */
export const source: WorkerSourceFactory = () => Effect.succeed(emptySource())
