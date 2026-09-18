import { Effect, Option, PlatformError } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { workerArgvMarker } from "@lister/worker-contract"

/**
 * One operating-system process entry from the process listing.
 */
export type ProcessEntry = {
  readonly pid: number
  readonly args: string
}

/**
 * Options for {@link sweepStaleWorkers}.
 */
export type SweepOptions = {
  /** Process listing seam; defaults to `ps -eo pid,args`. */
  readonly list?: Effect.Effect<
    ReadonlyArray<ProcessEntry>,
    PlatformError.PlatformError,
    ChildProcessSpawner.ChildProcessSpawner
  >
  /** Kill seam; defaults to `SIGTERM` via `process.kill`. */
  readonly kill?: (pid: number) => Effect.Effect<void, PlatformError.PlatformError>
  /** Process id to skip; defaults to the current process. */
  readonly selfPid?: number
}

const parseProcessLine = (line: string): Option.Option<ProcessEntry> => {
  const match = /^\s*(\d+)\s+(.*)$/.exec(line)

  if (match === null) {
    return Option.none()
  }

  const [, pidText = "", args = ""] = match
  const pid = Number(pidText)

  if (!Number.isSafeInteger(pid)) {
    return Option.none()
  }

  return Option.some({ pid, args })
}

const listProcesses: Effect.Effect<
  ReadonlyArray<ProcessEntry>,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const output = yield* spawner.string(ChildProcess.make("ps", ["-eo", "pid,args"]))

  return output.split("\n").flatMap((line) => Option.toArray(parseProcessLine(line)))
})

const killProcess = (pid: number): Effect.Effect<void, PlatformError.PlatformError> =>
  Effect.sync(() => {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Already exited; nothing left to terminate.
    }
  })

/**
 * Terminate orphaned crawler worker processes from a previous generation.
 *
 * A process is stale when its argv carries {@link workerArgvMarker} and it is
 * not this process. Every match is sent `SIGTERM` and returned in the order the
 * listing produced it.
 *
 * @param options - Listing, kill, and self-pid seams for tests.
 * @returns The process ids that were signalled.
 */
export const sweepStaleWorkers = (
  options?: SweepOptions
): Effect.Effect<
  ReadonlyArray<number>,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const selfPid = options?.selfPid ?? process.pid
    const entries = yield* (options?.list ?? listProcesses)
    const kill = options?.kill ?? killProcess
    const killed: Array<number> = []

    for (const entry of entries) {
      if (entry.pid === selfPid) continue

      if (!entry.args.includes(workerArgvMarker)) continue

      yield* kill(entry.pid)
      killed.push(entry.pid)
    }

    return killed
  })
