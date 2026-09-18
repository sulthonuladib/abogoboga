import { sweepStaleWorkers } from "@lister/crawler"
import { Console, Effect } from "effect"

/**
 * Terminate orphaned crawler worker processes from a previous generation.
 *
 * The crawler package matches processes by the `--crawler-worker` argv marker
 * used by the supervisor's boot sweep; this command reports the pids that were
 * terminated.
 */
export const runSweep = Effect.fn("runSweep")(function*() {
  const killed = yield* sweepStaleWorkers()

  if (killed.length === 0) {
    yield* Console.log("No stale crawler worker processes found.")

    return
  }

  yield* Console.log(`Terminated ${killed.length} stale crawler worker process(es): ${killed.join(", ")}`)
})
