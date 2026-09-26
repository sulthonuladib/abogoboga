/**
 * Miscellaneous SSR routes: the root redirect, the empty-slot fragment, the
 * not-found page, and the searchable option partials used by assignment forms.
 *
 * @module
 */

import { Chain, Exchange } from "@lister/api"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"
import { raw } from "../Html.ts"
import { fragmentResponse, isHtmxRequest, pageResponse, route, unexpectedReason } from "../Http.ts"
import { Layout } from "../Layout.ts"
import { queryParams, text } from "../RequestInput.ts"
import { ChainOptionsFragment } from "../views/Chains.ts"
import { ExchangeOptionsFragment } from "../views/Exchanges.ts"
import { NotFoundBody } from "../views/NotFound.ts"

const rootRoute = HttpRouter.add("GET", "/", HttpServerResponse.redirect("/dashboard", { status: 302 }))

const emptyPartialRoute = route("GET", "/partials/empty", (_request) =>
  Effect.succeed(fragmentResponse(raw(""))))

const notFoundRoute = route("GET", "/not-found", (request) => {
  const params = queryParams(request)
  const from = text(params, "from")
  const kind = text(params, "kind")
  const id = text(params, "id")

  const body = NotFoundBody({
    from: from === "" ? undefined : from,
    kind: kind === "" ? undefined : kind,
    id: id === "" ? undefined : id
  })

  if (isHtmxRequest(request)) {
    return Effect.succeed(fragmentResponse(body).pipe(HttpServerResponse.setStatus(404)))
  }

  return Effect.succeed(
    pageResponse(Layout({ title: "Not found", active: "", children: body })).pipe(
      HttpServerResponse.setStatus(404)
    )
  )
})

const exchangeOptionsRoute = route("GET", "/partials/exchanges/options", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const exchanges = yield* Exchange

    const list = yield* exchanges
      .list({ page: 1, limit: 10, search: q, searchBy: "name", orderBy: "id", order: "asc" })
      .pipe(Effect.catchTag("ExchangeError", unexpectedReason("Exchange", "list")))

    return fragmentResponse(
      ExchangeOptionsFragment({
        options: list.data.map((exchange) => ({ id: exchange.id, name: exchange.name })),
        total: list.meta.items,
        q,
        targetId: text(params, "target", "exchange-options"),
        selectName: text(params, "select", "exchangeId"),
        selectedId: text(params, "selected") || undefined
      })
    )
  }))

const chainOptionsRoute = route("GET", "/partials/chains/options", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const chains = yield* Chain

    const list = yield* chains
      .list({ page: 1, limit: 10, search: q, searchBy: "name", orderBy: "id", order: "asc" })
      .pipe(Effect.catchTag("ChainError", unexpectedReason("Chain", "list")))

    return fragmentResponse(
      ChainOptionsFragment({
        options: list.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code })),
        total: list.meta.items,
        q,
        targetId: text(params, "target", "chain-options"),
        selectName: text(params, "select", "chainId"),
        selectedId: text(params, "selected") || undefined
      })
    )
  }))

/**
 * Root, not-found, empty-slot, and option-search routes.
 */
export const MiscRoutes = Layer.mergeAll(
  rootRoute,
  emptyPartialRoute,
  notFoundRoute,
  exchangeOptionsRoute,
  chainOptionsRoute
)
