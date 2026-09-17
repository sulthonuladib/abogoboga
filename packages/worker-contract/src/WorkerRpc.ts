import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { BootstrapCoin } from "./BootstrapCoin.ts"
import { CanonicalTick } from "./CanonicalTick.ts"

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
 * Subscribe the worker to coins.
 */
export const Subscribe = Rpc.make("Subscribe", {
  payload: {
    coins: Schema.NonEmptyArray(BootstrapCoin)
  }
})

/**
 * Unsubscribe the worker from coins.
 */
export const Unsubscribe = Rpc.make("Unsubscribe", {
  payload: {
    coins: Schema.NonEmptyArray(BootstrapCoin)
  }
})

/**
 * Stream canonical ticks for the current subscription set.
 *
 * Interrupting the stream unsubscribes the caller.
 */
export const Ticks = Rpc.make("Ticks", {
  success: CanonicalTick,
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
 * Transport-independent: the stdio transport implements this group now, and a
 * socket/`RpcWorker` transport can implement it later with no contract change.
 */
export const WorkerRpc = RpcGroup.make(Subscribe, Unsubscribe, Ticks, Health)

/**
 * Union of the RPC definitions in {@link WorkerRpc}.
 */
export type WorkerRpcs = RpcGroup.Rpcs<typeof WorkerRpc>
