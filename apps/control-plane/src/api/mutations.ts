import { toast } from "@lister/ui/components/toast"
import { Cause, Exit, Option, Predicate } from "effect"
import { ApiClient } from "./client.ts"
import { describeApiError } from "./errors.ts"
import { chainLinksKey, chainsKey, coinsKey, exchangesKey, marketsKey, workersKey } from "./keys.ts"

/**
 * Mutation atoms for every write the interface performs.
 *
 * Mutations declare the reactivity keys they invalidate so dependent queries
 * refetch once the write succeeds.
 *
 * @module
 */

/** Chain mutations. */
export const chainMutations = {
  add: ApiClient.mutation("chain", "add"),
  findOrCreate: ApiClient.mutation("chain", "findOrCreate"),
  update: ApiClient.mutation("chain", "update"),
  remove: ApiClient.mutation("chain", "remove")
} as const

/** Coin mutations. */
export const coinMutations = {
  add: ApiClient.mutation("cryptocurrency", "add"),
  update: ApiClient.mutation("cryptocurrency", "update"),
  remove: ApiClient.mutation("cryptocurrency", "remove")
} as const

/** Exchange mutations. */
export const exchangeMutations = {
  add: ApiClient.mutation("exchange", "add"),
  update: ApiClient.mutation("exchange", "update"),
  remove: ApiClient.mutation("exchange", "remove")
} as const

/** Market-assignment mutations. */
export const marketMutations = {
  assign: ApiClient.mutation("market", "assign"),
  update: ApiClient.mutation("market", "update"),
  unassign: ApiClient.mutation("market", "unassign")
} as const

/** Chain-link mutations. */
export const chainLinkMutations = {
  add: ApiClient.mutation("chainLink", "add"),
  update: ApiClient.mutation("chainLink", "update"),
  remove: ApiClient.mutation("chainLink", "remove")
} as const

/** Worker lifecycle mutations. */
export const workerMutations = {
  start: ApiClient.mutation("workers", "start"),
  stop: ApiClient.mutation("workers", "stop")
} as const

/** Reactivity keys invalidated by each mutation family. */
export const mutationKeys = {
  chain: [chainsKey],
  coin: [coinsKey],
  exchange: [exchangesKey],
  market: [marketsKey],
  chainLink: [chainLinksKey],
  worker: [workersKey]
} as const

/**
 * Extract the typed error from a mutation exit.
 *
 * @template R - Typed failure of the endpoint.
 * @param exit - Failure exit from `useAtomSet(..., { mode: "promiseExit" })`.
 * @returns The typed API error, or `none` when the exit carried a defect.
 */
export const mutationError = <R>(exit: Exit.Exit<unknown, R>): Option.Option<R> =>
  Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none()

/**
 * Run a mutation, reporting success and failure through the shared toaster.
 *
 * @template A - Success value of the mutation.
 * @template R - Typed failure of the mutation.
 * @param run - Thunk returning the mutation exit.
 * @param messages - Toast titles; `success` may derive from the value.
 * @returns The success value, or `undefined` when the mutation failed.
 */
export const runMutation = async <A, R extends Error>(
  run: () => Promise<Exit.Exit<A, R>>,
  messages: {
    readonly success: string | ((value: A) => string)
    readonly failure: string
  }
): Promise<A | undefined> => {
  const exit = await run()

  if (Exit.isFailure(exit)) {
    toast.add({
      title: messages.failure,
      description: describeApiError(Option.getOrUndefined(mutationError(exit))),
      type: "error"
    })

    return undefined
  }

  toast.add({
    title: Predicate.isString(messages.success) ? messages.success : messages.success(exit.value),
    type: "success"
  })

  return exit.value
}
