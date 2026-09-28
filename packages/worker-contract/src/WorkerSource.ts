import { Effect, Schema, Stream } from "effect"
import type { BootstrapCoin } from "./BootstrapCoin.ts"
import type { CanonicalTick } from "./CanonicalTick.ts"

/**
 * Failure raised by an exchange owner hook while subscribing, unsubscribing, or
 * producing ticks.
 *
 * Both fields are optional so hooks can fail with a bare reason or wrap an
 * underlying websocket/decoding defect.
 */
export class WorkerSourceError extends Schema.TaggedError<WorkerSourceError>()("WorkerSourceError", {
  message: Schema.optional(Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024)))),
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * The exchange-owned half of a worker.
 *
 * The shared RPC host ({@link runRpcWorker}) drives these members; each
 * exchange app supplies one implementation.
 */
export interface WorkerSource {
  /**
   * Start streaming the given coins. Called once per live `Subscribe` command
   * and once at boot with the decoded bootstrap coins.
   */
  readonly subscribe: (coins: ReadonlyArray<BootstrapCoin>) => Effect.Effect<void, WorkerSourceError>
  /**
   * Stop streaming the given coins. Called once per live `Unsubscribe`
   * command.
   */
  readonly unsubscribe: (coins: ReadonlyArray<BootstrapCoin>) => Effect.Effect<void, WorkerSourceError>
  /**
   * The tick stream the host forwards to the supervisor through the `Ticks`
   * RPC.
   *
   * Failure triggers the host's self-healing reconnect, which rebuilds the
   * source from the current subscription set.
   */
  readonly ticks: Stream.Stream<CanonicalTick, WorkerSourceError>
  /**
   * Release exchange resources. Called when the worker is shut down,
   * immediately before the worker terminates.
   */
  readonly close: Effect.Effect<void>
}

/**
 * Builds the exchange-owned {@link WorkerSource} for one worker.
   *
   * @param initial - Bootstrap coins, never `undefined`.
   * @param context - Worker identity (`exchangeSlug`/`shardId`), needed for
   * tick construction and exchange-specific connection setup.
   */
export interface WorkerSourceFactory {
  (
    initial: ReadonlyArray<BootstrapCoin>,
    context: { readonly exchangeSlug: string; readonly shardId: string }
  ): Effect.Effect<WorkerSource, WorkerSourceError>
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
