/**
 * Coin routes: the coins page and table fragment, the create/edit modal, and
 * coin mutations.
 *
 * Reads and writes go through the Phase-5 `Cryptocurrency`, `Exchange`, and
 * `Chain` application services; the route layer only parses HTTP input,
 * branches full-document versus fragment responses, and projects service
 * failures into operator-facing markup.
 *
 * @module
 */

import {
  Chain,
  Cryptocurrency,
  Exchange,
  type CryptocurrencyCreate,
  type CryptocurrencyError,
  type CryptocurrencyStatsQuery,
  type CryptocurrencyUpdate,
  pageWindow
} from "@lister/api"
import { ChainId, CryptocurrencyId, ExchangeId } from "@lister/domain"
import { Effect, Layer, Match, Predicate } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { CloseModalOob, ToastOob } from "../Fragments.ts"
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
import {
  decodeId,
  formParams,
  integer,
  oneOf,
  optionalId,
  queryParams,
  slugify,
  text,
  trimmed,
  type Params
} from "../RequestInput.ts"
import {
  CoinFormFragment,
  CoinsPageBody,
  CoinsTableWrap,
  type CoinFilterState
} from "../views/Coins.ts"

const pageSize = 20

const defaultLogo = "https://example.com/logo.png"

const defaultCoinFilter: CoinFilterState = {
  q: "",
  sortBy: "markets",
  order: "desc",
  flag: "all",
  exchangeId: "",
  chainId: ""
}

const parseCoinFilter = (params: Params): CoinFilterState => ({
  q: text(params, "q", text(params, "search", "")),
  sortBy: oneOf(params, "sortBy", ["symbol", "markets", "chains", "blocked"] as const, "symbol"),
  order: oneOf(params, "order", ["asc", "desc"] as const, "asc"),
  flag: oneOf(params, "flag", ["all", "blocked", "single"] as const, "all"),
  exchangeId: text(params, "exchangeId"),
  chainId: text(params, "chainId")
})

const toStatsQuery = (filter: CoinFilterState, page: number): CryptocurrencyStatsQuery => ({
  search: filter.q,
  page,
  limit: pageSize,
  sortBy: filter.sortBy,
  order: filter.order,
  flag: filter.flag,
  exchangeId: optionalId(filter.exchangeId, ExchangeId),
  chainId: optionalId(filter.chainId, ChainId)
})

/** Whether a cryptocurrency failure means the requested row is missing. */
const isCoinMissing = (reason: CryptocurrencyError["reason"]): boolean =>
  Predicate.isTagged("CryptocurrencyNotFound")(reason)

/**
 * Operator-facing message for a failed coin write.
 *
 * @param error - Error returned by the `Cryptocurrency` service.
 * @returns A message suitable for the modal's inline alert.
 */
const coinWriteMessage = (error: CryptocurrencyError): string =>
  Match.value(error.reason).pipe(
    Match.tagsExhaustive({
      CryptocurrencyCoingeckoIdExists: (reason) =>
        `CoinGecko id "${reason.coingeckoId}" is already used by another coin`,
      CryptocurrencySlugExists: (reason) => `slug "${reason.slug}" is already used by another coin`,
      CryptocurrencyNotFound: () => "coin not found"
    })
  )

type CoinFormValues = {
  readonly id: number
  readonly symbol: string
  readonly name: string
  readonly slug: string
  readonly coingeckoId: string
  readonly logo: string
}

const coinFormError = (options: {
  readonly mode: "create" | "edit"
  readonly coin?: CoinFormValues | undefined
  readonly error: string
  readonly action: string
}) =>
  fragmentResponse(CoinFormFragment(options), { retarget: "#modal-slot", reswap: "innerHTML" })

/**
 * Loads the coins table wrap for a filter and page.
 *
 * @param filter - Parsed filter state.
 * @param page - Requested page.
 * @returns The table fragment.
 */
const loadCoinsWrap = Effect.fn("Ssr.coinsTable")(function*(
  filter: CoinFilterState,
  page: number
) {
  const cryptocurrency = yield* Cryptocurrency

  const result = yield* cryptocurrency
    .stats(toStatsQuery(filter, page))
    .pipe(Effect.catchTag("CryptocurrencyError", unexpectedReason("Cryptocurrency", "stats")))

  return CoinsTableWrap({
    rows: result.data,
    total: result.meta.items,
    page: result.meta.page,
    pages: Math.max(result.meta.pages, 1),
    sortBy: filter.sortBy,
    order: filter.order,
    filter
  })
})

/**
 * Loads the exchange and chain dropdown options shown by the coins filter bar.
 *
 * @returns Dropdown option lists.
 */
const loadCoinFilterLists = Effect.fn("Ssr.coinFilterLists")(function*() {
  const exchanges = yield* Exchange
  const chains = yield* Chain

  const exchangePage = yield* exchanges
    .list({ window: pageWindow(1), limit: -1, search: "", searchBy: ["name"], orderBy: "id", order: "asc" })
    .pipe(Effect.catchTag("ExchangeError", unexpectedReason("Exchange", "list")))

  const chainPage = yield* chains
    .list({ window: pageWindow(1), limit: -1, search: "", searchBy: ["name"], orderBy: "id", order: "asc" })
    .pipe(Effect.catchTag("ChainError", unexpectedReason("Chain", "list")))

  return {
    exchanges: exchangePage.data.map((exchange) => ({ id: exchange.id, name: exchange.name })),
    chains: chainPage.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code }))
  }
})

const coinsPageRoute = route("GET", "/coins", (request) =>
  Effect.gen(function*() {
    const filter = parseCoinFilter(queryParams(request))
    const cryptocurrency = yield* Cryptocurrency

    const result = yield* cryptocurrency
      .stats(toStatsQuery(filter, 1))
      .pipe(Effect.catchTag("CryptocurrencyError", unexpectedReason("Cryptocurrency", "stats")))

    const lists = yield* loadCoinFilterLists()

    const body = CoinsPageBody({
      rows: result.data,
      total: result.meta.items,
      filter,
      lists,
      page: result.meta.page,
      pages: Math.max(result.meta.pages, 1)
    })

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: "Coins", active: "/coins", children: body }))
  }))

const coinsPartialRoute = route("GET", "/partials/coins", (request) =>
  Effect.gen(function*() {
    const params = queryParams(request)
    const filter = parseCoinFilter(params)
    const body = yield* loadCoinsWrap(filter, integer(params, "page", 1))

    return fragmentResponse(body)
  }))

const coinNewRoute = route("GET", "/coins/new", (_request) =>
  Effect.succeed(fragmentResponse(CoinFormFragment({ mode: "create", action: "/coins" }))))

const coinCreateRoute = route("POST", "/coins", (request) =>
  Effect.gen(function*() {
    const params = yield* formParams(request)
    const symbol = trimmed(params, "symbol")

    if (symbol === "") {
      return coinFormError({ mode: "create", action: "/coins", error: "symbol is required" })
    }

    const input: CryptocurrencyCreate = {
      symbol,
      name: trimmed(params, "name") || symbol,
      slug: trimmed(params, "slug") || slugify(symbol),
      logo: trimmed(params, "logo") || defaultLogo,
      coingeckoId: trimmed(params, "coingeckoId") || slugify(symbol)
    }

    const cryptocurrency = yield* Cryptocurrency

    const outcome = yield* cryptocurrency.add(input).pipe(
      Effect.map((value) => ({ kind: "created" as const, value })),
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return unexpectedReason("Cryptocurrency", "add")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: coinWriteMessage(error),
          coin: { id: 0, symbol, name: input.name, slug: input.slug, coingeckoId: input.coingeckoId, logo: input.logo }
        })
      })
    )

    if (outcome.kind === "problem") {
      return coinFormError({
        mode: "create",
        action: "/coins",
        coin: outcome.coin,
        error: outcome.message
      })
    }

    const table = yield* loadCoinsWrap(defaultCoinFilter, 1)

    return fragmentResponse(
      html`${table}${CloseModalOob()}${ToastOob({ kind: "success", message: `${symbol} created` })}`
    )
  }))

const coinEditRoute = route("GET", "/coins/:id/edit", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const cryptocurrency = yield* Cryptocurrency

    const coin = yield* cryptocurrency.getById(id).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(id) }))
        }

        return unexpectedReason("Cryptocurrency", "getById")(error.reason)
      })
    )

    return fragmentResponse(
      CoinFormFragment({
        mode: "edit",
        coin: {
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          slug: coin.slug,
          coingeckoId: coin.coingeckoId,
          logo: coin.logo
        },
        action: `/coins/${String(coin.id)}`
      })
    )
  }))

const coinUpdateRoute = route("POST", "/coins/:id", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const cryptocurrency = yield* Cryptocurrency

    const existing = yield* cryptocurrency.getById(id).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(id) }))
        }

        return unexpectedReason("Cryptocurrency", "getById")(error.reason)
      })
    )

    const params = yield* formParams(request)
    const coingeckoId = trimmed(params, "coingeckoId") || existing.coingeckoId

    const input: CryptocurrencyUpdate = {
      symbol: trimmed(params, "symbol") || existing.symbol,
      name: trimmed(params, "name") || existing.name,
      slug: trimmed(params, "slug") || existing.slug,
      coingeckoId
    }

    const outcome = yield* cryptocurrency.update(id, input).pipe(
      Effect.map((value) => ({ kind: "saved" as const, value })),
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return unexpectedReason("Cryptocurrency", "update")(error.reason)
        }

        return Effect.succeed({
          kind: "problem" as const,
          message: coinWriteMessage(error),
          coin: { id, symbol: input.symbol, name: input.name, slug: input.slug, coingeckoId: input.coingeckoId, logo: existing.logo }
        })
      })
    )

    if (outcome.kind === "problem") {
      return coinFormError({
        mode: "edit",
        action: `/coins/${String(id)}`,
        coin: outcome.coin,
        error: outcome.message
      })
    }

    const table = yield* loadCoinsWrap(defaultCoinFilter, 1)

    return fragmentResponse(
      html`${table}${CloseModalOob()}${ToastOob({ kind: "success", message: `${input.symbol} saved` })}`
    )
  }))

const coinDeleteRoute = route("DELETE", "/coins/:id", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const id = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const cryptocurrency = yield* Cryptocurrency

    const existing = yield* cryptocurrency.getById(id).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(id) }))
        }

        return unexpectedReason("Cryptocurrency", "getById")(error.reason)
      })
    )

    yield* cryptocurrency.remove(id).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(id) }))
        }

        return unexpectedReason("Cryptocurrency", "remove")(error.reason)
      })
    )

    const stats = yield* cryptocurrency
      .stats({ page: 1, limit: 1, search: "", flag: "all", sortBy: "symbol", order: "asc" })
      .pipe(Effect.catchTag("CryptocurrencyError", unexpectedReason("Cryptocurrency", "stats")))

    return fragmentResponse(
      html`<span id="coins-count" hx-swap-oob="true" class="badge badge-neutral"
        >${String(stats.meta.items)} coins</span
      >${ToastOob({ kind: "success", message: `${existing.symbol} deleted` })}`
    )
  }))

/**
 * Every coin route in the SSR control plane.
 */
export const CoinsRoutes = Layer.mergeAll(
  coinsPageRoute,
  coinsPartialRoute,
  coinNewRoute,
  coinCreateRoute,
  coinEditRoute,
  coinUpdateRoute,
  coinDeleteRoute
)
