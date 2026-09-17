import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { ChainLink } from "./ChainLink.ts"
import { layer as ChainLinkStoreLive } from "./ChainLinkStore.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Chain-link group handlers without their dependencies, so tests can supply an
 * alternative `ChainLinkStore` implementation.
 *
 * Every service failure is unwrapped into its precise reason; reasons an
 * endpoint cannot produce are treated as defects (HTTP 500).
 */
export const ChainLinkHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "chainLink",
  Effect.fn(function*(handlers) {
    const chainLink = yield* ChainLink

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`ChainLink.${operation} reported unexpected ${reason._tag}`))

    return handlers.handleAll({
      add: ({ payload }) =>
        chainLink.add(payload).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkExists: (reason) => Effect.fail(reason),
            MarketNotFound: (reason) => Effect.fail(reason),
            ChainNotFound: (reason) => Effect.fail(reason),
            ChainLinkNotFound: unexpectedReason("add")
          })
        ),
      list: ({ payload }) => chainLink.list(payload).pipe(Effect.orDie),
      findById: ({ params }) =>
        chainLink.getById(params.id).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkNotFound: (reason) => Effect.fail(reason),
            ChainLinkExists: unexpectedReason("findById"),
            MarketNotFound: unexpectedReason("findById"),
            ChainNotFound: unexpectedReason("findById")
          })
        ),
      update: ({ params, payload }) =>
        chainLink.update(params.id, payload).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkNotFound: (reason) => Effect.fail(reason),
            ChainLinkExists: (reason) => Effect.fail(reason),
            MarketNotFound: (reason) => Effect.fail(reason),
            ChainNotFound: (reason) => Effect.fail(reason)
          })
        ),
      remove: ({ params }) =>
        chainLink.remove(params.id).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkNotFound: (reason) => Effect.fail(reason),
            ChainLinkExists: unexpectedReason("remove"),
            MarketNotFound: unexpectedReason("remove"),
            ChainNotFound: unexpectedReason("remove")
          })
        )
    })
  })
)

/**
 * Chain-link group handlers wired to the Drizzle-backed store and the
 * request-validation middleware; requires the `Database` service.
 */
export const ChainLinkHandlers = ChainLinkHandlersNoDeps.pipe(
  Layer.provide(ChainLink.layer),
  Layer.provide(ChainLinkStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
