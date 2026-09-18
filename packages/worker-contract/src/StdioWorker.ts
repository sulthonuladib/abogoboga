/**
 * Worker-side stdio transport.
 *
 * Binds an exchange-owned {@link WorkerSource} to the worker wire contract:
 * bootstrap coins arrive decoded from argv, `subscribe`/`unsubscribe` commands
 * arrive as newline-delimited JSON on stdin, and {@link CanonicalTick} values
 * are written as newline-delimited JSON to stdout. Logs go to stderr only, and
 * closing stdin makes the worker self-terminate.
 *
 * Every exchange app is a thin `BunRuntime.runMain(runStdioWorker(...))`
 * entrypoint; the exchange-specific streaming logic stays behind
 * {@link WorkerSourceFactory}.
 *
 * @module
 */
import { Cause, Effect, Inspectable, Logger, Schema, Stream } from "effect"

import {
  BootstrapCoinsFromString,
  formatBootstrapCoins,
  workerArgvIndex,
  workerArgvMarker,
  type BootstrapCoin
} from "./BootstrapCoin.ts"
import { encodeTickLine, type CanonicalTick } from "./CanonicalTick.ts"
import { decodeCommandLine } from "./WorkerCommand.ts"

/**
 * Failure raised by an exchange owner hook while subscribing, unsubscribing, or
 * producing ticks.
 *
 * Both fields are optional so hooks can fail with a bare reason or wrap an
 * underlying websocket/decoding defect.
 */
export class WorkerSourceError extends Schema.TaggedError<WorkerSourceError>()("WorkerSourceError", {
  message: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * The exchange-owned half of a worker subprocess.
 *
 * The shared stdio host ({@link runStdioWorker}) drives these members; each
 * exchange app supplies one implementation.
 */
export interface WorkerSource {
  /**
   * Start streaming the given coins. Called once per live stdin `subscribe`
   * command and once at boot with the decoded argv bootstrap coins.
   */
  readonly subscribe: (coins: ReadonlyArray<BootstrapCoin>) => Effect.Effect<void, WorkerSourceError>
  /**
   * Stop streaming the given coins. Called once per live stdin `unsubscribe`
   * command.
   */
  readonly unsubscribe: (coins: ReadonlyArray<BootstrapCoin>) => Effect.Effect<void, WorkerSourceError>
  /**
   * The tick stream the host encodes as one JSON line per tick on stdout.
   *
   * Failure ends the worker subprocess so the supervisor can respawn it.
   */
  readonly ticks: Stream.Stream<CanonicalTick, WorkerSourceError>
  /**
   * Release exchange resources. Called when stdin reaches EOF, immediately
   * before the worker self-terminates.
   */
  readonly close: Effect.Effect<void>
}

/**
 * Builds the exchange-owned {@link WorkerSource} for one worker subprocess.
 *
 * @param initial - Bootstrap coins decoded from argv, never `undefined`.
 * @param context - Worker identity from argv (`exchangeSlug`/`shardId`), needed
 * for tick construction and exchange-specific connection setup.
 */
export interface WorkerSourceFactory {
  (
    initial: ReadonlyArray<BootstrapCoin>,
    context: { readonly exchangeSlug: string; readonly shardId: string }
  ): Effect.Effect<WorkerSource, WorkerSourceError>
}

/**
 * Options for {@link runStdioWorker}.
 */
export interface RunStdioWorkerOptions {
  /**
   * Declared exchange slug of the app. Argv wins when it carries a non-blank
   * slug; this value covers embedded/test runs that omit the argv slot.
   */
  readonly exchangeSlug: string
  /**
   * Exchange owner hook; see {@link WorkerSourceFactory}.
   */
  readonly source: WorkerSourceFactory
  /**
   * Argv to parse. Defaults to `process.argv`, where a worker is launched as
   * `bun <script> --crawler-worker <exchangeSlug> <shardId> <coins>`.
   */
  readonly argv?: ReadonlyArray<string>
}

/**
 * A {@link WorkerSource} that does nothing.
 *
 * Lets an exchange app ship as a runnable entrypoint before its
 * exchange-specific websocket logic is ported; it subscribes to nothing and
 * emits no ticks.
 */
export const emptySource = (): WorkerSource => ({
  subscribe: () => Effect.void,
  unsubscribe: () => Effect.void,
  ticks: Stream.never,
  close: Effect.void
})

/**
 * Renders a hook failure for stderr, including an optional cause.
 *
 * @param error - The hook failure to format.
 * @returns A single-line description.
 */
const formatSourceError = (error: WorkerSourceError): string => {
  const message = error.message ?? "worker source failure"

  return error.cause === undefined ? message : `${message}: ${Inspectable.toStringUnknown(error.cause)}`
}

/**
 * Writes a startup reason to stderr and terminates the process.
 *
 * The exit is synchronous and never returns, so callers can treat this as a
 * bottom effect.
 *
 * @param code - Non-zero process exit code.
 * @param reason - Reason line written to stderr (logs only ever go there).
 */
const exitWithReason = (code: number, reason: string): Effect.Effect<never> =>
  Effect.sync(() => {
    process.stderr.write(`${reason}\n`)

    return process.exit(code)
  })

/**
 * Writes one tick as a newline-delimited JSON line on stdout.
 *
 * @param tick - The tick to encode.
 */
const writeTick = (tick: CanonicalTick): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(`${encodeTickLine(tick)}\n`)
  })

/**
 * Handles one stdin line: subscribe, unsubscribe, or log-and-ignore.
 *
 * A hook failure is logged and does not stop the command loop.
 *
 * @param source - The exchange owner hook.
 * @param line - The raw stdin line.
 */
const handleStdinLine = (source: WorkerSource, line: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const command = decodeCommandLine(line)

    if (command === null) {
      if (line.trim() !== "") {
        yield* Effect.logWarning(`worker: ignoring malformed stdin line: ${line}`)
      }

      return
    }

    const coins = command.coins

    if (command.type === "subscribe") {
      yield* source.subscribe(coins).pipe(
        Effect.catchTag("WorkerSourceError", (error) =>
          Effect.logError(`worker: subscribe failed: ${formatSourceError(error)}`)
        )
      )
      yield* Effect.logInfo(`worker: subscribed ${formatBootstrapCoins(coins)}`)

      return
    }

    yield* source.unsubscribe(coins).pipe(
      Effect.catchTag("WorkerSourceError", (error) =>
        Effect.logError(`worker: unsubscribe failed: ${formatSourceError(error)}`)
      )
    )
    yield* Effect.logInfo(`worker: unsubscribed ${formatBootstrapCoins(coins)}`)
  })

/**
 * Reads newline-delimited JSON commands from stdin until EOF, then closes the
 * source and exits 0 as the wire contract requires.
 *
 * @param source - The exchange owner hook the commands are applied to.
 */
const runStdin = (source: WorkerSource): Effect.Effect<void> =>
  Stream.fromReadableStream({
    evaluate: () => Bun.stdin.stream(),
    onError: (cause) => new WorkerSourceError({ message: "failed to read stdin", cause })
  }).pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => handleStdinLine(source, line)),
    Effect.andThen(source.close),
    Effect.andThen(
      Effect.sync(() => {
        process.exit(0)
      })
    ),
    Effect.catchTag("WorkerSourceError", (error) =>
      Effect.gen(function*() {
        yield* Effect.logError(`worker: stdin failed: ${formatSourceError(error)}`)

        return yield* exitWithReason(1, "worker: terminating after stdin failure")
      })
    )
  )

/**
 * Runs the tick stream and the stdin command loop for one built source.
 *
 * @param options - Host options carrying the exchange owner hook.
 * @param coins - Bootstrap coins decoded from argv.
 * @param identity - Worker identity parsed from argv.
 */
const workerProgram = (
  options: RunStdioWorkerOptions,
  coins: ReadonlyArray<BootstrapCoin>,
  identity: { readonly exchangeSlug: string; readonly shardId: string }
): Effect.Effect<void, never> =>
  Effect.gen(function*() {
    const { exchangeSlug, shardId } = identity

    yield* Effect.logInfo(
      `worker: boot exchange=${exchangeSlug} shard=${shardId} coins=${formatBootstrapCoins(coins)}`
    )

    const source = yield* options.source(coins, identity).pipe(
      Effect.catchTag("WorkerSourceError", (error) =>
        exitWithReason(1, `worker: failed to start source: ${formatSourceError(error)}`)
      )
    )

    yield* Effect.all(
      [
        source.ticks.pipe(
          Stream.runForEach(writeTick),
          Effect.catchTag("WorkerSourceError", (error) =>
            exitWithReason(1, `worker: tick stream failed: ${formatSourceError(error)}`)
          )
        ),
        runStdin(source)
      ],
      { concurrency: "unbounded" }
    )
  }).pipe(
    Effect.annotateLogs({ exchangeSlug: identity.exchangeSlug, shardId: identity.shardId }),
    Effect.provideService(Logger.LogToStderr, true),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.interrupt : exitWithReason(1, `worker: fatal error: ${Cause.pretty(cause)}`)
    )
  )

/**
 * Runs the worker side of the wire contract for one exchange.
 *
 * Parses argv (`--crawler-worker <exchangeSlug> <shardId> <coins>`), builds the
 * exchange source, streams its ticks to stdout, and applies stdin commands
 * until EOF. Bootstrap or marker problems write a reason to stderr and exit 2;
 * hook failures end the process non-zero so the supervisor respawns it. Logs
 * never touch stdout.
 *
 * The returned effect has no requirements and never fails; it is safe to run
 * with `BunRuntime.runMain`.
 *
 * @param options - Exchange owner hook plus optional argv override.
 */
export const runStdioWorker = Effect.fn("runStdioWorker")(function*(
  options: RunStdioWorkerOptions
): Effect.fn.Return<void, never> {
  const argv = options.argv ?? process.argv
  const marker = argv[workerArgvIndex.marker]

  if (marker !== workerArgvMarker) {
    return yield* exitWithReason(
      2,
      `worker: expected argv[${workerArgvIndex.marker}]="${workerArgvMarker}" but got "${marker ?? ""}"`
    )
  }

  const exchangeSlug = argv[workerArgvIndex.exchange] ?? options.exchangeSlug
  const shardId = argv[workerArgvIndex.shard] ?? "shard-0"
  const bootstrapArg = argv[workerArgvIndex.coins] ?? ""

  const coins = yield* Schema.decodeUnknownEffect(BootstrapCoinsFromString)(bootstrapArg).pipe(
    Effect.catch((error) =>
      exitWithReason(2, `worker: invalid bootstrap coins "${bootstrapArg}": ${error.message}`)
    )
  )

  yield* workerProgram(options, coins, { exchangeSlug, shardId })
})
