/**
 * Transfer-routes routes: the matrix page and fragment for one coin, plus the
 * directed-route detail modal.
 *
 * Route status comes from the pure `@lister/domain` transfer helpers, so the
 * SSR UI and the JSON API share one source of truth for "can value move?".
 *
 * @module
 */

import { Cryptocurrency, type CryptocurrencyError, type CryptocurrencyMetadata } from "@lister/control-plane-api"
import { CryptocurrencyId, orderedPairStatus, viableChains, type ChainLinkFlags } from "@lister/domain"
import { Effect, Layer, Predicate } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { CloseDrawerOob } from "../Fragments.ts"
import { html } from "../Html.ts"
import { EntityMiss, fragmentResponse, isHtmxRequest, pageResponse, route, unexpectedReason } from "../Http.ts"
import { Layout } from "../Layout.ts"
import { decodeId, queryParams, text } from "../RequestInput.ts"
import { RouteDetailFragment, RoutesMatrixBody, type RouteMatrixCell } from "../views/RoutesMatrix.ts"

/** Whether a cryptocurrency failure means the requested row is missing. */
const isCoinMissing = (reason: CryptocurrencyError["reason"]): boolean =>
  Predicate.isTagged("CryptocurrencyNotFound")(reason)

const toFlags = (
  market: CryptocurrencyMetadata["exchanges"][number]
): ReadonlyArray<ChainLinkFlags> =>
  market.chains.map((chain) => ({
    chainId: chain.id,
    withdrawEnabled: chain.withdrawEnabled,
    depositEnabled: chain.depositEnabled
  }))

/**
 * Loads the directed route matrix for one coin.
 *
 * @param coinId - Branded coin id.
 * @returns The coin identity, its markets, and every directed cell.
 */
const buildRouteCells = Effect.fn("Ssr.routeCells")(function*(
  coinId: CryptocurrencyId
) {
  const cryptocurrency = yield* Cryptocurrency

  const metadata = yield* cryptocurrency.metadata({ by: "id", id: coinId }).pipe(
    Effect.catchTag("CryptocurrencyError", (error) => {
      if (isCoinMissing(error.reason)) {
        return Effect.fail(new EntityMiss({ kind: "coin", id: String(coinId) }))
      }

      return unexpectedReason("Cryptocurrency", "metadata")(error.reason)
    })
  )

  const exchanges = metadata.exchanges.map((market) => ({
    marketId: market.marketId,
    exchangeName: market.name
  }))

  const cells: Array<RouteMatrixCell> = []

  for (const from of metadata.exchanges) {
    for (const to of metadata.exchanges) {
      if (from.marketId === to.marketId) continue

      cells.push({
        fromMarketId: from.marketId,
        toMarketId: to.marketId,
        fromExchange: from.name,
        toExchange: to.name,
        status: orderedPairStatus(toFlags(from), toFlags(to))
      })
    }
  }

  return {
    coin: { id: metadata.id, symbol: metadata.symbol, name: metadata.name },
    exchanges,
    cells
  }
})

const routesMatrixRoute = route("GET", "/coins/:id/routes", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const coinId = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const { coin, exchanges, cells } = yield* buildRouteCells(coinId)
    const body = RoutesMatrixBody({ coin, exchanges, cells })

    if (isHtmxRequest(request)) return fragmentResponse(html`${body}${CloseDrawerOob()}`)

    return pageResponse(Layout({ title: `Routes ${coin.symbol}`, active: "/coins", children: body }))
  }))

const routesMatrixPartialRoute = route("GET", "/partials/coins/:id/routes", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const coinId = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const { coin, exchanges, cells } = yield* buildRouteCells(coinId)

    return fragmentResponse(html`${RoutesMatrixBody({ coin, exchanges, cells })}${CloseDrawerOob()}`)
  }))

const routeDetailRoute = route("GET", "/partials/coins/:id/routes/detail", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const coinId = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const params = queryParams(request)
    const fromId = Number(text(params, "from"))
    const toId = Number(text(params, "to"))

    if (!Number.isSafeInteger(fromId) || !Number.isSafeInteger(toId)) {
      return yield* Effect.fail(
        new EntityMiss({
          kind: "route",
          id: `${String(coinId)}:${text(params, "from")}-${text(params, "to")}`
        })
      )
    }

    const cryptocurrency = yield* Cryptocurrency

    const metadata = yield* cryptocurrency.metadata({ by: "id", id: coinId }).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(coinId) }))
        }

        return unexpectedReason("Cryptocurrency", "metadata")(error.reason)
      })
    )

    const from = metadata.exchanges.find((market) => market.marketId === fromId)
    const to = metadata.exchanges.find((market) => market.marketId === toId)

    if (from === undefined || to === undefined) {
      return yield* Effect.fail(new EntityMiss({ kind: "route", id: `${String(fromId)}-${String(toId)}` }))
    }

    const codes = new Map<number, string>()

    for (const market of metadata.exchanges) {
      for (const chain of market.chains) codes.set(chain.id, chain.code)
    }

    const sourceFlags = toFlags(from)
    const destinationFlags = toFlags(to)

    return fragmentResponse(
      RouteDetailFragment({
        coin: { id: metadata.id, symbol: metadata.symbol },
        from: from.name,
        to: to.name,
        status: orderedPairStatus(sourceFlags, destinationFlags),
        via: viableChains(sourceFlags, destinationFlags).map((chainId) => codes.get(chainId) ?? String(chainId))
      })
    )
  }))

/**
 * Every transfer-routes route in the SSR control plane.
 */
export const RoutesMatrixRoutes = Layer.mergeAll(
  routesMatrixRoute,
  routesMatrixPartialRoute,
  routeDetailRoute
)
