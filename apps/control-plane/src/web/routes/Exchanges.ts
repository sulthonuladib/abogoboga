/**
 * Exchange routes: the exchanges page and table fragment, the create/edit
 * modal, the detail page, and guarded deletion.
 *
 * @module
 */

import {
  Exchange,
  Market,
  type ExchangeCreate,
  type ExchangeError,
  type ExchangeListQuery,
  type ExchangeUpdate
} from "@lister/control-plane-api"
import { ExchangeId } from "@lister/domain"
import { Effect, Layer, Match, Predicate } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { CloseModalOob, ErrorFragment, ToastOob } from "../Fragments.ts"
import { html } from "../Html.ts"
import {
  EntityMiss,
  fragmentResponse,
  isHtmxRequest,
  pageResponse,
  route,
  unexpectedReason
} from "../Http.ts"
import { Layout } from "../Layout.ts"
import { decodeId, formParams, integer, oneOf, queryParams, slugify, text, trimmed } from "../RequestInput.ts"
import {
  ExchangeDetailBody,
  ExchangeFormFragment,
  ExchangesPageBody,
  ExchangesTableWrap,
  type ExchangeRow
} from "../views/Exchanges.ts"

const pageSize = 20

const listQuery = (q: string, page: number): ExchangeListQuery => ({
  page,
  limit: pageSize,
  search: q,
  searchBy: "name",
  orderBy: "id",
  order: "asc"
})

/** Whether an exchange failure means the requested row is missing. */
const isExchangeMissing = (reason: ExchangeError["reason"]): boolean =>
  Predicate.isTagged("ExchangeNotFound")(reason)

/**
 * Operator-facing message for a failed exchange write.
 *
 * @param error - Error returned by the `Exchange` service.
 * @returns A message suitable for the modal's inline alert.
 */
const exchangeWriteMessage = (error: ExchangeError): string =>
  Match.value(error.reason).pipe(
    Match.tagsExhaustive({
      ExchangeCoingeckoIdExists: (reason) => `CoinGecko id "${reason.coingeckoId}" is already used by another exchange`,
      ExchangeSlugExists: (reason) => `slug "${reason.slug}" is already used by another exchange`,
      ExchangeNotFound: () => "exchange not found"
    })
  )

/**
 * Loads one page of exchange rows with each exchange's assigned-coin count.
 *
 * @param q - Search text.
 * @param page - Requested page.
 * @returns Rows plus paging totals.
 */
const loadExchangeRows = Effect.fn("Ssr.exchangeRows")(function*(q: string, page: number) {
  const exchanges = yield* Exchange
  const markets = yield* Market

  const list = yield* exchanges
    .list(listQuery(q, page))
    .pipe(Effect.catchTag("ExchangeError", unexpectedReason("Exchange", "list")))

  const rows: Array<ExchangeRow> = []

  for (const exchange of list.data) {
    const coins = yield* markets
      .count({ exchangeId: exchange.id })
      .pipe(Effect.catchTag("MarketError", unexpectedReason("Market", "count")))

    rows.push({
      id: exchange.id,
      name: exchange.name,
      slug: exchange.slug,
      coingeckoId: exchange.coingeckoId,
      baseCurrency: exchange.baseCurrency,
      registeredOnCmc: exchange.registeredOnCmc,
      coins
    })
  }

  return { rows, total: list.meta.items, page: list.meta.page, pages: Math.max(list.meta.pages, 1) }
})

const exchangesPageRoute = route("GET", "/exchanges", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const { rows, total, page, pages } = yield* loadExchangeRows(q, integer(params, "page", 1))
    const body = ExchangesPageBody({ rows, total, q, page, pages })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: "Exchanges", active: "/exchanges", children: body }))
  }))

const exchangesPartialRoute = route("GET", "/partials/exchanges", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const { rows, total, page, pages } = yield* loadExchangeRows(q, integer(params, "page", 1))

    return fragmentResponse(ExchangesTableWrap({ rows, total, page, pages, q }))
  }))

const exchangeNewRoute = route("GET", "/exchanges/new", (_request) =>
  Effect.succeed(fragmentResponse(ExchangeFormFragment({ mode: "create", action: "/exchanges" }))))

const exchangeCreateRoute = route("POST", "/exchanges", (request) =>
  Effect.gen(function*() {
    const params = yield* formParams(request)
    const name = trimmed(params, "name")

    if (name === "") {
      return fragmentResponse(
        ExchangeFormFragment({ mode: "create", action: "/exchanges", error: "name is required" }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const input: ExchangeCreate = {
      name,
      slug: trimmed(params, "slug") || slugify(name),
      coingeckoId: trimmed(params, "coingeckoId") || slugify(name),
      logo: "https://example.com/exchange.png",
      registeredOnCmc: true,
      baseCurrency: oneOf(params, "baseCurrency", ["usdt", "idr"] as const, "usdt")
    }

    const exchanges = yield* Exchange

    const outcome = yield* exchanges.add(input).pipe(
      Effect.map((value) => ({ kind: "created" as const, value })),
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return unexpectedReason("Exchange", "add")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: exchangeWriteMessage(error),
          values: {
            id: 0,
            name,
            slug: input.slug,
            coingeckoId: input.coingeckoId,
            baseCurrency: input.baseCurrency
          }
        })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        ExchangeFormFragment({
          mode: "create",
          action: "/exchanges",
          exchange: outcome.values,
          error: outcome.message
        }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const { rows, total, page, pages } = yield* loadExchangeRows("", 1)

    return fragmentResponse(
      html`${ExchangesTableWrap({ rows, total, page, pages, q: "" })}${CloseModalOob()}${ToastOob({
        kind: "success",
        message: `${name} created`
      })}`
    )
  }))

const exchangeDetailRoute = route("GET", "/exchanges/:id", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ExchangeId, "exchange")
    const exchanges = yield* Exchange
    const markets = yield* Market

    const exchange = yield* exchanges.getById(id).pipe(
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "exchange", id: String(id) }))
        }

        return unexpectedReason("Exchange", "getById")(error.reason)
      })
    )

    const coins = yield* markets
      .count({ exchangeId: id })
      .pipe(Effect.catchTag("MarketError", unexpectedReason("Market", "count")))

    const body = ExchangeDetailBody({
      exchange: {
        id: exchange.id,
        name: exchange.name,
        slug: exchange.slug,
        coingeckoId: exchange.coingeckoId,
        baseCurrency: exchange.baseCurrency,
        registeredOnCmc: exchange.registeredOnCmc
      },
      coins
    })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: exchange.name, active: "/exchanges", children: body }))
  }))

const exchangeEditRoute = route("GET", "/exchanges/:id/edit", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ExchangeId, "exchange")
    const exchanges = yield* Exchange

    const exchange = yield* exchanges.getById(id).pipe(
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "exchange", id: String(id) }))
        }

        return unexpectedReason("Exchange", "getById")(error.reason)
      })
    )

    return fragmentResponse(
      ExchangeFormFragment({
        mode: "edit",
        exchange: {
          id: exchange.id,
          name: exchange.name,
          slug: exchange.slug,
          coingeckoId: exchange.coingeckoId,
          baseCurrency: exchange.baseCurrency
        },
        action: `/exchanges/${String(exchange.id)}`
      })
    )
  }))

const exchangeUpdateRoute = route("POST", "/exchanges/:id", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ExchangeId, "exchange")
    const exchanges = yield* Exchange

    const existing = yield* exchanges.getById(id).pipe(
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "exchange", id: String(id) }))
        }

        return unexpectedReason("Exchange", "getById")(error.reason)
      })
    )

    const params = yield* formParams(request)

    const input: ExchangeUpdate = {
      name: trimmed(params, "name") || existing.name,
      slug: trimmed(params, "slug") || existing.slug,
      coingeckoId: existing.coingeckoId,
      logo: existing.logo,
      registeredOnCmc: existing.registeredOnCmc,
      baseCurrency: existing.baseCurrency
    }

    const outcome = yield* exchanges.update(id, input).pipe(
      Effect.map((value) => ({ kind: "saved" as const, value })),
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return unexpectedReason("Exchange", "update")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: exchangeWriteMessage(error),
          values: {
            id,
            name: input.name,
            slug: input.slug,
            coingeckoId: input.coingeckoId,
            baseCurrency: input.baseCurrency
          }
        })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        ExchangeFormFragment({
          mode: "edit",
          action: `/exchanges/${String(id)}`,
          exchange: outcome.values,
          error: outcome.message
        }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const { rows, total, page, pages } = yield* loadExchangeRows("", 1)

    return fragmentResponse(
      html`${ExchangesTableWrap({ rows, total, page, pages, q: "" })}${CloseModalOob()}${ToastOob({
        kind: "success",
        message: "exchange saved"
      })}`
    )
  }))

const exchangeDeleteRoute = route("DELETE", "/exchanges/:id", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ExchangeId, "exchange")
    const exchanges = yield* Exchange
    const markets = yield* Market

    const assignments = yield* markets
      .count({ exchangeId: id })
      .pipe(Effect.catchTag("MarketError", unexpectedReason("Market", "count")))

    if (assignments > 0) {
      return fragmentResponse(
        ErrorFragment({
          message: `cannot delete exchange with ${String(assignments)} market assignments; remove the assignments first`
        }),
        { retarget: "#exchanges-error", reswap: "innerHTML" }
      )
    }

    yield* exchanges.remove(id).pipe(
      Effect.catchTag("ExchangeError", (error) => {
        if (isExchangeMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "exchange", id: String(id) }))
        }

        return unexpectedReason("Exchange", "remove")(error.reason)
      })
    )

    const { total } = yield* loadExchangeRows("", 1)

    return fragmentResponse(
      html`<span id="exchanges-count" hx-swap-oob="true" class="badge badge-neutral"
        >${String(total)} exchanges</span
      >${ToastOob({ kind: "success", message: "exchange deleted" })}`
    )
  }))

/**
 * Every exchange route in the SSR control plane.
 */
export const ExchangesRoutes = Layer.mergeAll(
  exchangesPageRoute,
  exchangesPartialRoute,
  exchangeNewRoute,
  exchangeCreateRoute,
  exchangeDetailRoute,
  exchangeEditRoute,
  exchangeUpdateRoute,
  exchangeDeleteRoute
)
