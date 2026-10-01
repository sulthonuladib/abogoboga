import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "./Api.ts"
import { Chain, type ChainListQuery } from "./Chain.ts"
import { ChainListPayload } from "./ChainApi.ts"
import { layer as ChainStoreLive } from "./ChainStore.ts"
import { toListWindow } from "./Pagination.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Translate a decoded list payload into the application query.
 *
 * @param payload - Decoded `POST /api/chain/list` payload.
 * @returns The query accepted by `Chain.list`.
 */
const listQuery = (payload: typeof ChainListPayload.Type): ChainListQuery => ({
  window: toListWindow(payload),
  limit: payload.limit,
  search: payload.search,
  searchBy: [...new Set(payload.searchBy)],
  orderBy: payload.orderBy,
  order: payload.order
})

/**
 * Chain group handlers without their dependencies, so tests can supply an
 * alternative `ChainStore` implementation.
 *
 * Every service failure is unwrapped into its precise reason; reasons an
 * endpoint cannot produce are treated as defects (HTTP 500).
 */
export const ChainHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "chain",
  Effect.fn(function*(handlers) {
    const chain = yield* Chain

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`Chain.${operation} reported unexpected ${reason._tag}`))

    return handlers.handleAll({
      add: ({ payload }) =>
        chain.add(payload).pipe(
          Effect.unwrapReason("ChainError"),
          Effect.catchTags({
            ChainCodeExists: (reason) => Effect.fail(reason),
            ChainNotFound: unexpectedReason("add")
          })
        ),
      findOrCreate: ({ payload }) => chain.findOrCreate(payload).pipe(Effect.orDie),
      list: ({ payload }) => chain.list(listQuery(payload)).pipe(Effect.orDie),
      findById: ({ params }) =>
        chain.getById(params.id).pipe(
          Effect.unwrapReason("ChainError"),
          Effect.catchTags({
            ChainNotFound: (reason) => Effect.fail(reason),
            ChainCodeExists: unexpectedReason("findById")
          })
        ),
      update: ({ params, payload }) =>
        chain.update(params.id, payload).pipe(
          Effect.unwrapReason("ChainError"),
          Effect.catchTags({
            ChainNotFound: (reason) => Effect.fail(reason),
            ChainCodeExists: (reason) => Effect.fail(reason)
          })
        ),
      remove: ({ params }) =>
        chain.remove(params.id).pipe(
          Effect.unwrapReason("ChainError"),
          Effect.catchTags({
            ChainNotFound: (reason) => Effect.fail(reason),
            ChainCodeExists: unexpectedReason("remove")
          })
        )
    })
  })
)

/**
 * Chain group handlers wired to the Drizzle-backed store and the
 * request-validation middleware; requires the `Database` service.
 */
export const ChainHandlers = ChainHandlersNoDeps.pipe(
  Layer.provide(Chain.layer),
  Layer.provide(ChainStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
