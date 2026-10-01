import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { BootstrapCoin } from "./BootstrapCoin.ts"
import { CanonicalTick } from "./CanonicalTick.ts"
import { WorkerSourceError } from "./WorkerSource.ts"

/**
 * Worker liveness report.
 */
export const WorkerHealth = Schema.Struct({
  running: Schema.Boolean
})

/**
 * Worker liveness report.
 */
export type WorkerHealth = typeof WorkerHealth.Type

/**
 * Connection phase a worker reports to the supervisor.
 *
 * `starting` precedes the first tick, `running` means the exchange connection
 * is healthy and ticking, and `reconnecting` is reported between connection
 * attempts after a failure.
 */
export const WorkerStatus = Schema.Struct({
  phase: Schema.Literals(["starting", "running", "reconnecting"]),
  attempt: Schema.optional(Schema.Int),
  message: Schema.optional(Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024))))
})

/**
 * Connection phase a worker reports to the supervisor.
 */
export type WorkerStatus = typeof WorkerStatus.Type

/**
 * Subscribe the worker to coins.
 *
 * Fails with {@link WorkerSourceError} when the exchange hook rejects the
 * subscription.
 */
export const Subscribe = Rpc.make("Subscribe", {
  payload: {
    coins: Schema.NonEmptyArray(BootstrapCoin)
  },
  error: WorkerSourceError
})

/**
 * Unsubscribe the worker from coins.
 *
 * Fails with {@link WorkerSourceError} when the exchange hook rejects the
 * unsubscribe.
 */
export const Unsubscribe = Rpc.make("Unsubscribe", {
  payload: {
    coins: Schema.NonEmptyArray(BootstrapCoin)
  },
  error: WorkerSourceError
})

/**
 * Stream canonical ticks for the current subscription set.
 *
 * Interrupting the stream stops delivery but leaves the worker serving
 * commands; the stream self-heals across connection failures.
 */
export const Ticks = Rpc.make("Ticks", {
  success: CanonicalTick,
  stream: true
})

/**
 * Stream worker-reported connection state (`starting`/`running`/`reconnecting`).
 */
export const Status = Rpc.make("Status", {
  success: WorkerStatus,
  stream: true
})

/**
 * Report worker liveness.
 */
export const Health = Rpc.make("Health", {
  success: WorkerHealth
})

/**
 * Supervisor/worker RPC contract.
 *
 * Transport-independent: the RPC worker transport implements this group now,
 * and a socket/http transport can implement it later with no contract change.
 */
export const WorkerRpc = RpcGroup.make(Subscribe, Unsubscribe, Ticks, Status, Health)

/**
 * Union of the RPC definitions in {@link WorkerRpc}.
 */
export type WorkerRpcs = RpcGroup.Rpcs<typeof WorkerRpc>
