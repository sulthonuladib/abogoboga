import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { Cryptocurrency } from "./Cryptocurrency.ts"
import { layer as CryptocurrencyStoreLive } from "./CryptocurrencyStore.ts"
import type { CryptocurrencyLookup } from "./CryptocurrencyErrors.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Cryptocurrency group handlers without their dependencies, so tests can supply
 * an alternative `CryptocurrencyStore` implementation.
 *
 * Every service failure is unwrapped into its precise reason; reasons an
 * endpoint cannot produce are treated as defects (HTTP 500).
 */
export const CryptocurrencyHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "cryptocurrency",
  Effect.fn(function*(handlers) {
    const cryptocurrency = yield* Cryptocurrency

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`Cryptocurrency.${operation} reported unexpected ${reason._tag}`))

    return handlers.handleAll({
      add: ({ payload }) =>
        cryptocurrency.add(payload).pipe(
          Effect.unwrapReason("CryptocurrencyError"),
          Effect.catchTags({
            CryptocurrencyCoingeckoIdExists: (reason) => Effect.fail(reason),
            CryptocurrencySlugExists: (reason) => Effect.fail(reason),
            CryptocurrencyNotFound: unexpectedReason("add")
          })
        ),
      list: ({ payload }) => cryptocurrency.list(payload).pipe(Effect.orDie),
      stats: ({ payload }) => cryptocurrency.stats(payload).pipe(Effect.orDie),
      metadata: ({ payload }) => {
        const lookup: CryptocurrencyLookup = "id" in payload ? { by: "id", id: payload.id } : { by: "slug", slug: payload.slug }

        return cryptocurrency.metadata(lookup).pipe(
          Effect.unwrapReason("CryptocurrencyError"),
          Effect.catchTags({
            CryptocurrencyNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyCoingeckoIdExists: unexpectedReason("metadata"),
            CryptocurrencySlugExists: unexpectedReason("metadata")
          })
        )
      },
      findById: ({ params }) =>
        cryptocurrency.getById(params.id).pipe(
          Effect.unwrapReason("CryptocurrencyError"),
          Effect.catchTags({
            CryptocurrencyNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyCoingeckoIdExists: unexpectedReason("findById"),
            CryptocurrencySlugExists: unexpectedReason("findById")
          })
        ),
      update: ({ params, payload }) =>
        cryptocurrency.update(params.id, payload).pipe(
          Effect.unwrapReason("CryptocurrencyError"),
          Effect.catchTags({
            CryptocurrencyNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyCoingeckoIdExists: (reason) => Effect.fail(reason),
            CryptocurrencySlugExists: (reason) => Effect.fail(reason)
          })
        ),
      remove: ({ params }) =>
        cryptocurrency.remove(params.id).pipe(
          Effect.unwrapReason("CryptocurrencyError"),
          Effect.catchTags({
            CryptocurrencyNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyCoingeckoIdExists: unexpectedReason("remove"),
            CryptocurrencySlugExists: unexpectedReason("remove")
          })
        )
    })
  })
)

/**
 * Cryptocurrency group handlers wired to the Drizzle-backed store and the
 * request-validation middleware; requires the `Database` service.
 */
export const CryptocurrencyHandlers = CryptocurrencyHandlersNoDeps.pipe(
  Layer.provide(Cryptocurrency.layer),
  Layer.provide(CryptocurrencyStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
