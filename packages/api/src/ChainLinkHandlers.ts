import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import type { ChainId } from "@lister/domain"
import type { MarketId } from "@lister/domain"
import { Api } from "./Api.ts"
import { ChainLink } from "./ChainLink.ts"
import { layer as ChainLinkStoreLive } from "./ChainLinkStore.ts"
import { CoinDetailEvents } from "./CoinDetailEvents.ts"
import { Market } from "./Market.ts"
import { layer as MarketStoreLive } from "./MarketStore.ts"
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
    const market = yield* Market
    const events = yield* CoinDetailEvents

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`ChainLink.${operation} reported unexpected ${reason._tag}`))

    /** Resolve the owning exchange/coin pair and publish the mutation. */
    const publish = (
      kind: "chain-added" | "chain-updated" | "chain-removed",
      link: { readonly exchangeCryptocurrencyId: MarketId; readonly chainId: ChainId }
    ) =>
      Effect.gen(function*() {
        const parent = yield* market.getById(link.exchangeCryptocurrencyId).pipe(Effect.orDie)

        yield* events.publish({
          kind,
          exchangeId: parent.exchangeId,
          cryptocurrencyId: parent.cryptocurrencyId,
          exchangeCryptocurrencyId: link.exchangeCryptocurrencyId,
          chainId: link.chainId
        })
      })

    return handlers.handleAll({
      add: ({ payload }) =>
        chainLink.add(payload).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkExists: (reason) => Effect.fail(reason),
            MarketNotFound: (reason) => Effect.fail(reason),
            ChainNotFound: (reason) => Effect.fail(reason),
            ChainLinkNotFound: unexpectedReason("add")
          }),
          Effect.tap((added) => publish("chain-added", added))
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
          }),
          Effect.tap((updated) => publish("chain-updated", updated))
        ),
      remove: ({ params }) =>
        chainLink.remove(params.id).pipe(
          Effect.unwrapReason("ChainLinkError"),
          Effect.catchTags({
            ChainLinkNotFound: (reason) => Effect.fail(reason),
            ChainLinkExists: unexpectedReason("remove"),
            MarketNotFound: unexpectedReason("remove"),
            ChainNotFound: unexpectedReason("remove")
          }),
          Effect.tap((removed) => publish("chain-removed", removed))
        )
    })
  })
)

/**
 * Chain-link group handlers wired to the Drizzle-backed stores, the no-op
 * mutation publisher, and the request-validation middleware; requires the
 * `Database` service.
 */
export const ChainLinkHandlers = ChainLinkHandlersNoDeps.pipe(
  Layer.provide(ChainLink.layer),
  Layer.provide(ChainLinkStoreLive),
  Layer.provide(Market.layer),
  Layer.provide(MarketStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
