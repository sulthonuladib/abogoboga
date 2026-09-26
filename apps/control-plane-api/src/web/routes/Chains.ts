/**
 * Chain routes: the chains page and table fragment, the create/edit modal, the
 * detail page, and guarded deletion.
 *
 * @module
 */

import {
  Chain,
  ChainLink,
  Market,
  type ChainCreate,
  type ChainError,
  type ChainListQuery,
  type ChainUpdate,
  pageWindow
} from "@lister/api"
import { ChainId } from "@lister/domain"
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
import { decodeId, formParams, integer, queryParams, text, trimmed } from "../RequestInput.ts"
import {
  ChainDetailBody,
  ChainFormFragment,
  ChainsPageBody,
  ChainsTableWrap,
  type ChainRow
} from "../views/Chains.ts"

const pageSize = 20

const listQuery = (q: string, page: number): ChainListQuery => ({
  window: pageWindow(page),
  limit: pageSize,
  search: q,
  searchBy: ["name"],
  orderBy: "id",
  order: "asc"
})

/** Whether a chain failure means the requested row is missing. */
const isChainMissing = (reason: ChainError["reason"]): boolean => Predicate.isTagged("ChainNotFound")(reason)

/**
 * Operator-facing message for a failed chain write.
 *
 * @param error - Error returned by the `Chain` service.
 * @returns A message suitable for the modal's inline alert.
 */
const chainWriteMessage = (error: ChainError): string =>
  Match.value(error.reason).pipe(
    Match.tagsExhaustive({
      ChainCodeExists: (reason) => `code "${reason.code}" is already used by another chain`,
      ChainNotFound: () => "chain not found"
    })
  )

/**
 * Loads one page of chain rows with each chain's distinct-coin count.
 *
 * @param q - Search text.
 * @param page - Requested page.
 * @returns Rows plus paging totals.
 */
const loadChainRows = Effect.fn("Ssr.chainRows")(function*(q: string, page: number) {
  const chains = yield* Chain
  const markets = yield* Market
  const links = yield* ChainLink

  const list = yield* chains
    .list(listQuery(q, page))
    .pipe(Effect.catchTag("ChainError", unexpectedReason("Chain", "list")))

  const allMarkets = yield* markets
    .list({})
    .pipe(Effect.catchTag("MarketError", unexpectedReason("Market", "list")))

  const allLinks = yield* links
    .list({})
    .pipe(Effect.catchTag("ChainLinkError", unexpectedReason("ChainLink", "list")))

  const coinByMarket = new Map<number, number>()

  for (const market of allMarkets) {
    coinByMarket.set(market.id, market.cryptocurrencyId)
  }

  const rows: Array<ChainRow> = list.data.map((chain) => {
    const coinIds = new Set<number>()

    for (const link of allLinks) {
      if (link.chainId !== chain.id) continue

      const coinId = coinByMarket.get(link.exchangeCryptocurrencyId)

      if (coinId !== undefined) coinIds.add(coinId)
    }

    return { id: chain.id, name: chain.name, code: chain.code, coins: coinIds.size }
  })

  return { rows, total: list.meta.items, page: list.meta.page, pages: Math.max(list.meta.pages, 1) }
})

const chainsPageRoute = route("GET", "/chains", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const { rows, total, page, pages } = yield* loadChainRows(q, integer(params, "page", 1))
    const body = ChainsPageBody({ rows, total, q, page, pages })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: "Chains", active: "/chains", children: body }))
  }))

const chainsPartialRoute = route("GET", "/partials/chains", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const q = text(params, "q")
    const { rows, total, page, pages } = yield* loadChainRows(q, integer(params, "page", 1))

    return fragmentResponse(ChainsTableWrap({ rows, total, page, pages, q }))
  }))

const chainNewRoute = route("GET", "/chains/new", (_request) =>
  Effect.succeed(fragmentResponse(ChainFormFragment({ mode: "create", action: "/chains" }))))

const chainCreateRoute = route("POST", "/chains", (request) =>
  Effect.gen(function*() {
    const params = yield* formParams(request)
    const name = trimmed(params, "name")
    const code = trimmed(params, "code")

    if (name === "" || code === "") {
      return fragmentResponse(
        ChainFormFragment({ mode: "create", action: "/chains", error: "name and code are required" }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const input: ChainCreate = { name, code }
    const chains = yield* Chain

    const outcome = yield* chains.add(input).pipe(
      Effect.map((value) => ({ kind: "created" as const, value })),
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return unexpectedReason("Chain", "add")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: chainWriteMessage(error),
          values: { id: 0, name, code }
        })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        ChainFormFragment({
          mode: "create",
          action: "/chains",
          chain: outcome.values,
          error: outcome.message
        }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const { rows, total, page, pages } = yield* loadChainRows("", 1)

    return fragmentResponse(
      html`${ChainsTableWrap({ rows, total, page, pages, q: "" })}${CloseModalOob()}${ToastOob({
        kind: "success",
        message: `${name} created`
      })}`
    )
  }))

const chainDetailRoute = route("GET", "/chains/:id", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ChainId, "chain")
    const chains = yield* Chain
    const links = yield* ChainLink

    const chain = yield* chains.getById(id).pipe(
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain", id: String(id) }))
        }

        return unexpectedReason("Chain", "getById")(error.reason)
      })
    )

    const refs = yield* links
      .list({ chainId: id })
      .pipe(Effect.catchTag("ChainLinkError", unexpectedReason("ChainLink", "list")))

    const body = ChainDetailBody({ chain: { id: chain.id, name: chain.name, code: chain.code }, coins: refs.length })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: chain.name, active: "/chains", children: body }))
  }))

const chainEditRoute = route("GET", "/chains/:id/edit", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ChainId, "chain")
    const chains = yield* Chain

    const chain = yield* chains.getById(id).pipe(
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain", id: String(id) }))
        }

        return unexpectedReason("Chain", "getById")(error.reason)
      })
    )

    return fragmentResponse(
      ChainFormFragment({
        mode: "edit",
        chain: { id: chain.id, name: chain.name, code: chain.code },
        action: `/chains/${String(chain.id)}`
      })
    )
  }))

const chainUpdateRoute = route("POST", "/chains/:id", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ChainId, "chain")
    const chains = yield* Chain

    const existing = yield* chains.getById(id).pipe(
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain", id: String(id) }))
        }

        return unexpectedReason("Chain", "getById")(error.reason)
      })
    )

    const params = yield* formParams(request)

    const input: ChainUpdate = {
      name: trimmed(params, "name") || existing.name,
      code: trimmed(params, "code") || existing.code
    }

    const outcome = yield* chains.update(id, input).pipe(
      Effect.map((value) => ({ kind: "saved" as const, value })),
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return unexpectedReason("Chain", "update")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: chainWriteMessage(error),
          values: { id, name: input.name, code: input.code }
        })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        ChainFormFragment({
          mode: "edit",
          action: `/chains/${String(id)}`,
          chain: outcome.values,
          error: outcome.message
        }),
        { retarget: "#modal-slot", reswap: "innerHTML" }
      )
    }

    const { rows, total, page, pages } = yield* loadChainRows("", 1)

    return fragmentResponse(
      html`${ChainsTableWrap({ rows, total, page, pages, q: "" })}${CloseModalOob()}${ToastOob({
        kind: "success",
        message: "chain saved"
      })}`
    )
  }))

const chainDeleteRoute = route("DELETE", "/chains/:id", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], ChainId, "chain")
    const chains = yield* Chain
    const links = yield* ChainLink

    const refs = yield* links
      .list({ chainId: id })
      .pipe(Effect.catchTag("ChainLinkError", unexpectedReason("ChainLink", "list")))

    if (refs.length > 0) {
      return fragmentResponse(
        ErrorFragment({
          message: `cannot delete chain referenced by ${String(refs.length)} rows; remove the references first`
        }),
        { retarget: "#chains-error", reswap: "innerHTML" }
      )
    }

    yield* chains.remove(id).pipe(
      Effect.catchTag("ChainError", (error) => {
        if (isChainMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain", id: String(id) }))
        }

        return unexpectedReason("Chain", "remove")(error.reason)
      })
    )

    const { total } = yield* loadChainRows("", 1)

    return fragmentResponse(
      html`<span id="chains-count" hx-swap-oob="true" class="badge badge-neutral"
        >${String(total)} chains</span
      >${ToastOob({ kind: "success", message: "chain deleted" })}`
    )
  }))

/**
 * Every chain route in the SSR control plane.
 */
export const ChainsRoutes = Layer.mergeAll(
  chainsPageRoute,
  chainsPartialRoute,
  chainNewRoute,
  chainCreateRoute,
  chainDetailRoute,
  chainEditRoute,
  chainUpdateRoute,
  chainDeleteRoute
)
