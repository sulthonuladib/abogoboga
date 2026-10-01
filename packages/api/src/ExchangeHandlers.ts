import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "./Api.ts"
import { Exchange, type ExchangeListQuery } from "./Exchange.ts"
import { ExchangeListPayload } from "./ExchangeApi.ts"
import { layer as ExchangeStoreLive } from "./ExchangeStore.ts"
import { toListWindow } from "./Pagination.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Translate a decoded list payload into the application query.
 *
 * @param payload - Decoded `POST /api/exchange/list` payload.
 * @returns The query accepted by `Exchange.list`.
 */
const listQuery = (payload: typeof ExchangeListPayload.Type): ExchangeListQuery => ({
  window: toListWindow(payload),
  limit: payload.limit,
  search: payload.search,
  searchBy: [...new Set(payload.searchBy)],
  orderBy: payload.orderBy,
  order: payload.order
})

/**
 * Exchange group handlers without their dependencies, so tests can supply an
 * alternative `ExchangeStore` implementation.
 *
 * Every service failure is unwrapped into its precise reason; reasons an
 * endpoint cannot produce are treated as defects (HTTP 500).
 */
export const ExchangeHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "exchange",
  Effect.fn(function*(handlers) {
    const exchange = yield* Exchange

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`Exchange.${operation} reported unexpected ${reason._tag}`))

    return handlers.handleAll({
      add: ({ payload }) =>
        exchange.add(payload).pipe(
          Effect.unwrapReason("ExchangeError"),
          Effect.catchTags({
            ExchangeCoingeckoIdExists: (reason) => Effect.fail(reason),
            ExchangeSlugExists: (reason) => Effect.fail(reason),
            ExchangeNotFound: unexpectedReason("add")
          })
        ),
      list: ({ payload }) => exchange.list(listQuery(payload)).pipe(Effect.orDie),
      findById: ({ params }) =>
        exchange.getById(params.id).pipe(
          Effect.unwrapReason("ExchangeError"),
          Effect.catchTags({
            ExchangeNotFound: (reason) => Effect.fail(reason),
            ExchangeCoingeckoIdExists: unexpectedReason("findById"),
            ExchangeSlugExists: unexpectedReason("findById")
          })
        ),
      update: ({ params, payload }) =>
        exchange.update(params.id, payload).pipe(
          Effect.unwrapReason("ExchangeError"),
          Effect.catchTags({
            ExchangeNotFound: (reason) => Effect.fail(reason),
            ExchangeCoingeckoIdExists: (reason) => Effect.fail(reason),
            ExchangeSlugExists: (reason) => Effect.fail(reason)
          })
        ),
      remove: ({ params }) =>
        exchange.remove(params.id).pipe(
          Effect.unwrapReason("ExchangeError"),
          Effect.catchTags({
            ExchangeNotFound: (reason) => Effect.fail(reason),
            ExchangeCoingeckoIdExists: unexpectedReason("remove"),
            ExchangeSlugExists: unexpectedReason("remove")
          })
        )
    })
  })
)

/**
 * Exchange group handlers wired to the Drizzle-backed store and the
 * request-validation middleware; requires the `Database` service.
 */
export const ExchangeHandlers = ExchangeHandlersNoDeps.pipe(
  Layer.provide(Exchange.layer),
  Layer.provide(ExchangeStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
