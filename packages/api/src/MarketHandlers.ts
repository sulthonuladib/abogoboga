import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "./Api.ts"
import { CoinDetailEvents } from "./CoinDetailEvents.ts"
import { Market } from "./Market.ts"
import { layer as MarketStoreLive } from "./MarketStore.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Market-assignment group handlers without their dependencies, so tests can
 * supply an alternative `MarketStore` implementation.
 *
 * Every service failure is unwrapped into its precise reason; reasons an
 * endpoint cannot produce are treated as defects (HTTP 500).
 */
export const MarketHandlersNoDeps = HttpApiBuilder.group(
  Api,
  "market",
  Effect.fn(function*(handlers) {
    const market = yield* Market
    const events = yield* CoinDetailEvents

    const unexpectedReason = (operation: string) => (reason: { readonly _tag: string }) =>
      Effect.die(new Error(`Market.${operation} reported unexpected ${reason._tag}`))

    return handlers.handleAll({
      assign: ({ payload }) =>
        market.assign(payload).pipe(
          Effect.unwrapReason("MarketError"),
          Effect.catchTags({
            MarketExists: (reason) => Effect.fail(reason),
            ExchangeNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyNotFound: (reason) => Effect.fail(reason),
            MarketNotFound: unexpectedReason("assign")
          }),
          Effect.tap((assigned) =>
            events.publish({
              kind: "mapping-added",
              exchangeId: assigned.exchangeId,
              cryptocurrencyId: assigned.cryptocurrencyId,
              exchangeCryptocurrencyId: assigned.id
            })
          )
        ),
      list: ({ payload }) => market.list(payload).pipe(Effect.orDie),
      count: ({ payload }) => market.count(payload).pipe(Effect.orDie),
      findById: ({ params }) =>
        market.getById(params.id).pipe(
          Effect.unwrapReason("MarketError"),
          Effect.catchTags({
            MarketNotFound: (reason) => Effect.fail(reason),
            MarketExists: unexpectedReason("findById"),
            ExchangeNotFound: unexpectedReason("findById"),
            CryptocurrencyNotFound: unexpectedReason("findById")
          })
        ),
      update: ({ params, payload }) =>
        market.update(params.id, payload).pipe(
          Effect.unwrapReason("MarketError"),
          Effect.catchTags({
            MarketNotFound: (reason) => Effect.fail(reason),
            MarketExists: (reason) => Effect.fail(reason),
            ExchangeNotFound: (reason) => Effect.fail(reason),
            CryptocurrencyNotFound: (reason) => Effect.fail(reason)
          }),
          Effect.tap((updated) =>
            events.publish({
              kind: "mapping-updated",
              exchangeId: updated.exchangeId,
              cryptocurrencyId: updated.cryptocurrencyId,
              exchangeCryptocurrencyId: updated.id
            })
          )
        ),
      unassign: ({ params }) =>
        market.unassign(params.id).pipe(
          Effect.unwrapReason("MarketError"),
          Effect.catchTags({
            MarketNotFound: (reason) => Effect.fail(reason),
            MarketExists: unexpectedReason("unassign"),
            ExchangeNotFound: unexpectedReason("unassign"),
            CryptocurrencyNotFound: unexpectedReason("unassign")
          }),
          Effect.tap((removed) =>
            events.publish({
              kind: "mapping-removed",
              exchangeId: removed.exchangeId,
              cryptocurrencyId: removed.cryptocurrencyId,
              exchangeCryptocurrencyId: removed.id
            })
          )
        )
    })
  })
)

/**
 * Market-assignment group handlers wired to the Drizzle-backed store and the
 * request-validation middleware; requires the `Database` service.
 */
export const MarketHandlers = MarketHandlersNoDeps.pipe(
  Layer.provide(Market.layer),
  Layer.provide(MarketStoreLive),
  Layer.provideMerge(RequestValidationLive)
)
