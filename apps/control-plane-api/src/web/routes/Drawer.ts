/**
 * Coin-drawer routes: the drawer shell and body, market assignment and
 * unassignment, chain-link creation, toggling, and removal.
 *
 * Every mutation returns a fresh `#drawer-body` fragment plus out-of-band
 * feedback, so the drawer never carries stale coverage data.
 *
 * @module
 */

import {
  Chain,
  ChainLink,
  Cryptocurrency,
  Exchange,
  Market,
  type ChainLinkCreate,
  type ChainLinkError,
  type ChainLinkUpdate,
  type CryptocurrencyError,
  type CryptocurrencyMetadata,
  type MarketCreate,
  type MarketError,
  type MarketUpdate,
  pageWindow
} from "@lister/api"
import { ChainId, ChainLinkId, CryptocurrencyId, ExchangeId, MarketId, type Market as MarketModel } from "@lister/domain"
import { Effect, Layer, Match, Option, Predicate } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { ToastOob } from "../Fragments.ts"
import { html } from "../Html.ts"
import { EntityMiss, fragmentResponse, route, unexpectedReason } from "../Http.ts"
import { checkbox, decodeId, formParams, optionalId, queryParams, text, trimmed } from "../RequestInput.ts"
import { CoinDrawer, DrawerBody, type DrawerMarket } from "../views/Drawer.ts"

type DrawerOverrides = {
  readonly assignError?: string | undefined
  readonly assignExchangeId?: string | undefined
  readonly assignSymbol?: string | undefined
  readonly assignQuery?: string | undefined
  readonly linkError?: string | undefined
  readonly linkMarketId?: number | undefined
  readonly linkChainId?: string | undefined
  readonly linkCode?: string | undefined
  readonly linkQuery?: string | undefined
}

const toDrawerMarkets = (metadata: CryptocurrencyMetadata): ReadonlyArray<DrawerMarket> =>
  metadata.exchanges.map((market) => ({
    marketId: market.marketId,
    exchangeId: market.id,
    exchangeName: market.name,
    exchangeSymbol: market.symbol,
    listed: market.listed,
    tradeEnabled: market.tradeEnabled,
    chains: market.chains.map((chain) => ({
      linkId: chain.linkId,
      chainId: chain.id,
      chainName: chain.name,
      chainCode: chain.code,
      exchangeChainCode: chain.exchangeChainCode,
      withdrawEnabled: chain.withdrawEnabled,
      depositEnabled: chain.depositEnabled
    }))
  }))

/**
 * Loads the exchange and chain option lists shown inside the drawer.
 *
 * @param exchangeQuery - Live exchange search text.
 * @param chainQuery - Live chain search text.
 * @returns Option lists plus their unpaginated totals.
 */
const loadDrawerLists = Effect.fn("Ssr.drawerLists")(function*(
  exchangeQuery = "",
  chainQuery = ""
) {
  const exchanges = yield* Exchange
  const chains = yield* Chain

  const exchangePage = yield* exchanges
    .list({ window: pageWindow(1), limit: 10, search: exchangeQuery, searchBy: ["name"], orderBy: "id", order: "asc" })
    .pipe(Effect.catchTag("ExchangeError", unexpectedReason("Exchange", "list")))

  const chainPage = yield* chains
    .list({ window: pageWindow(1), limit: 10, search: chainQuery, searchBy: ["name"], orderBy: "id", order: "asc" })
    .pipe(Effect.catchTag("ChainError", unexpectedReason("Chain", "list")))

  return {
    exchanges: exchangePage.data.map((exchange) => ({ id: exchange.id, name: exchange.name })),
    exchangeTotal: exchangePage.meta.items,
    chains: chainPage.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code })),
    chainTotal: chainPage.meta.items
  }
})

/**
 * Loads the drawer body for one coin, preserving form values and errors.
 *
 * @param coinId - Branded coin id.
 * @param overrides - Optional form errors and preserved values.
 * @returns The drawer-body fragment.
 */
const loadDrawerBody = Effect.fn("Ssr.drawerBody")(function*(
  coinId: CryptocurrencyId,
  overrides?: DrawerOverrides
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

  const lists = yield* loadDrawerLists(overrides?.assignQuery ?? "", overrides?.linkQuery ?? "")

  return DrawerBody({
    coinId,
    markets: toDrawerMarkets(metadata),
    lists,
    ...overrides
  })
})

/** Whether a cryptocurrency failure means the requested row is missing. */
const isCoinMissing = (reason: CryptocurrencyError["reason"]): boolean =>
  Predicate.isTagged("CryptocurrencyNotFound")(reason)

/** Whether a market failure means the requested row is missing. */
const isMarketMissing = (reason: MarketError["reason"]): boolean =>
  Predicate.isTagged("MarketNotFound")(reason)

/** Whether a market failure means one of its references is missing. */
const isMarketReferenceMissing = (reason: MarketError["reason"]): boolean =>
  Predicate.isTagged("ExchangeNotFound")(reason) || Predicate.isTagged("CryptocurrencyNotFound")(reason)

/** Whether a chain-link failure means the requested row is missing. */
const isChainLinkMissing = (reason: ChainLinkError["reason"]): boolean =>
  Predicate.isTagged("ChainLinkNotFound")(reason)

/**
 * Operator-facing message for a failed market assignment write.
 *
 * @param error - Error returned by the `Market` service.
 * @returns A message suitable for the drawer's inline alert.
 */
const marketProblemMessage = (error: MarketError): string =>
  Match.value(error.reason).pipe(
    Match.tagsExhaustive({
      MarketExists: () => "market assignment already exists",
      MarketNotFound: () => "market assignment not found",
      ExchangeNotFound: () => "exchange not found",
      CryptocurrencyNotFound: () => "coin not found"
    })
  )

/**
 * Operator-facing message for a failed chain-link write.
 *
 * @param error - Error returned by the `ChainLink` service.
 * @returns A message suitable for the drawer's inline alert.
 */
const chainLinkProblemMessage = (error: ChainLinkError): string =>
  Match.value(error.reason).pipe(
    Match.tagsExhaustive({
      ChainLinkExists: () => "this market already links that chain",
      ChainLinkNotFound: () => "chain link not found",
      MarketNotFound: () => "market assignment not found",
      ChainNotFound: () => "chain not found"
    })
  )

const drawerRoute = route("GET", "/partials/coins/:id/drawer", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const coinId = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const cryptocurrency = yield* Cryptocurrency

    const metadata = yield* cryptocurrency.metadata({ by: "id", id: coinId }).pipe(
      Effect.catchTag("CryptocurrencyError", (error) => {
        if (isCoinMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "coin", id: String(coinId) }))
        }

        return unexpectedReason("Cryptocurrency", "metadata")(error.reason)
      })
    )

    const lists = yield* loadDrawerLists()

    return fragmentResponse(
      CoinDrawer({
        coin: { id: metadata.id, symbol: metadata.symbol, name: metadata.name },
        markets: toDrawerMarkets(metadata),
        lists
      })
    )
  }))

const marketAssignRoute = route("POST", "/partials/coins/:id/markets", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const coinId = yield* decodeId(pathParams["id"], CryptocurrencyId, "coin")
    const params = yield* formParams(request)
    const exchangeIdRaw = text(params, "exchangeId")
    const exchangeId = optionalId(exchangeIdRaw, ExchangeId)
    const assignQuery = text(params, "q")
    const symbolRaw = text(params, "exchangeSymbol")

    if (exchangeId === undefined) {
      return fragmentResponse(
        yield* loadDrawerBody(coinId, {
          assignError: "select an exchange",
          assignExchangeId: exchangeIdRaw,
          assignSymbol: symbolRaw,
          assignQuery
        })
      )
    }

    const input: MarketCreate = {
      exchangeId,
      cryptocurrencyId: coinId,
      exchangeSymbol: trimmed(params, "exchangeSymbol") || "SYM",
      listed: true,
      tradeEnabled: true
    }

    const markets = yield* Market

    const outcome = yield* markets.assign(input).pipe(
      Effect.match({
        onFailure: (error) => ({ kind: "problem" as const, message: marketProblemMessage(error) }),
        onSuccess: (value) => ({ kind: "assigned" as const, value })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        yield* loadDrawerBody(coinId, {
          assignError: outcome.message,
          assignExchangeId: exchangeIdRaw,
          assignSymbol: symbolRaw,
          assignQuery
        })
      )
    }

    return fragmentResponse(
      html`${yield* loadDrawerBody(coinId)}${ToastOob({ kind: "success", message: "market assigned" })}`
    )
  }))

const marketUpdateRoute = route("POST", "/partials/markets/:id/update", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const marketId = yield* decodeId(pathParams["id"], MarketId, "market")
    const markets = yield* Market

    const existing = yield* markets.getById(marketId).pipe(
      Effect.catchTag("MarketError", (error) => {
        if (isMarketMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "market", id: String(marketId) }))
        }

        return unexpectedReason("Market", "getById")(error.reason)
      })
    )

    const params = yield* formParams(request)

    const input: MarketUpdate = {
      exchangeId: existing.exchangeId,
      cryptocurrencyId: existing.cryptocurrencyId,
      exchangeSymbol: trimmed(params, "exchangeSymbol") || existing.exchangeSymbol,
      listed: checkbox(params, "listed"),
      tradeEnabled: checkbox(params, "tradeEnabled")
    }

    const updated = yield* markets.update(marketId, input).pipe(
      Effect.map((value) => ({ kind: "saved" as const, value })),
      Effect.catchTag("MarketError", (error) => {
        if (isMarketMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "market", id: String(marketId) }))
        }

        if (isMarketReferenceMissing(error.reason)) {
          return unexpectedReason("Market", "update")(error.reason)
        }

        return Effect.succeed({ kind: "problem" as const, message: marketProblemMessage(error) })
      })
    )

    if (updated.kind === "problem") {
      return fragmentResponse(
        html`<div id="drawer-error"><div class="alert alert-error my-2" role="alert"
          ><span class="text-sm">${updated.message}</span></div
        ></div>`
      )
    }

    return fragmentResponse(
      html`${yield* loadDrawerBody(existing.cryptocurrencyId)}${ToastOob({ kind: "success", message: "market saved" })}`
    )
  }))

const marketDeleteRoute = route("DELETE", "/partials/markets/:id", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const marketId = yield* decodeId(pathParams["id"], MarketId, "market")
    const markets = yield* Market

    const existing = yield* markets.getById(marketId).pipe(
      Effect.catchTag("MarketError", (error) => {
        if (isMarketMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "market", id: String(marketId) }))
        }

        return unexpectedReason("Market", "getById")(error.reason)
      })
    )

    yield* markets.unassign(marketId).pipe(
      Effect.catchTag("MarketError", (error) => {
        if (isMarketMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "market", id: String(marketId) }))
        }

        return unexpectedReason("Market", "unassign")(error.reason)
      })
    )

    return fragmentResponse(
      html`${yield* loadDrawerBody(existing.cryptocurrencyId)}${ToastOob({
        kind: "success",
        message: "market unassigned"
      })}`
    )
  }))

const chainLinkAddRoute = route("POST", "/partials/markets/:id/chains", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const marketId = yield* decodeId(pathParams["id"], MarketId, "market")
    const markets = yield* Market

    const market = yield* markets.getById(marketId).pipe(
      Effect.catchTag("MarketError", (error) => {
        if (isMarketMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "market", id: String(marketId) }))
        }

        return unexpectedReason("Market", "getById")(error.reason)
      })
    )

    const params = yield* formParams(request)
    const chainIdRaw = text(params, "chainId")
    const chainId = optionalId(chainIdRaw, ChainId)
    const linkQuery = text(params, "q")
    const codeRaw = text(params, "exchangeChainCode")

    if (chainId === undefined) {
      return fragmentResponse(
        yield* loadDrawerBody(market.cryptocurrencyId, {
          linkError: "select a chain",
          linkMarketId: marketId,
          linkChainId: chainIdRaw,
          linkCode: codeRaw,
          linkQuery
        })
      )
    }

    const input: ChainLinkCreate = {
      exchangeCryptocurrencyId: marketId,
      chainId,
      exchangeChainCode: trimmed(params, "exchangeChainCode") || "CODE",
      exchangeChainName: null,
      withdrawEnabled: true,
      depositEnabled: true
    }

    const links = yield* ChainLink

    const outcome = yield* links.add(input).pipe(
      Effect.match({
        onFailure: (error) => ({ kind: "problem" as const, message: chainLinkProblemMessage(error) }),
        onSuccess: (value) => ({ kind: "linked" as const, value })
      })
    )

    if (outcome.kind === "problem") {
      return fragmentResponse(
        yield* loadDrawerBody(market.cryptocurrencyId, {
          linkError: outcome.message,
          linkMarketId: marketId,
          linkChainId: chainIdRaw,
          linkCode: codeRaw,
          linkQuery
        })
      )
    }

    return fragmentResponse(
      html`${yield* loadDrawerBody(market.cryptocurrencyId)}${ToastOob({ kind: "success", message: "chain linked" })}`
    )
  }))

const chainLinkDeleteRoute = route("DELETE", "/partials/chain-links/:id", (_request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const linkId = yield* decodeId(pathParams["id"], ChainLinkId, "chain-link")
    const links = yield* ChainLink
    const markets = yield* Market

    const existing = yield* links.getById(linkId).pipe(
      Effect.catchTag("ChainLinkError", (error) => {
        if (isChainLinkMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain-link", id: String(linkId) }))
        }

        return unexpectedReason("ChainLink", "getById")(error.reason)
      })
    )

    yield* links.remove(linkId).pipe(
      Effect.catchTag("ChainLinkError", (error) => {
        if (isChainLinkMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain-link", id: String(linkId) }))
        }

        return unexpectedReason("ChainLink", "remove")(error.reason)
      })
    )

    const parent = yield* markets.getById(existing.exchangeCryptocurrencyId).pipe(
      Effect.asSome,
      Effect.catchTag("MarketError", () => Effect.succeed(Option.none<MarketModel>()))
    )

    if (Option.isNone(parent)) {
      return fragmentResponse(html`<div id="drawer-body"><div class="alert alert-info"><span>Removed.</span></div></div>`)
    }

    return fragmentResponse(
      html`${yield* loadDrawerBody(parent.value.cryptocurrencyId)}${ToastOob({
        kind: "success",
        message: "chain link removed"
      })}`
    )
  }))

const chainLinkToggleRoute = route("POST", "/partials/chain-links/:id/toggle", (request) =>
  Effect.gen(function*() {
    const pathParams = yield* HttpRouter.params
    const linkId = yield* decodeId(pathParams["id"], ChainLinkId, "chain-link")
    const flag = text(queryParams(request), "flag", "withdraw")
    const links = yield* ChainLink
    const markets = yield* Market

    const existing = yield* links.getById(linkId).pipe(
      Effect.catchTag("ChainLinkError", (error) => {
        if (isChainLinkMissing(error.reason)) {
          return Effect.fail(new EntityMiss({ kind: "chain-link", id: String(linkId) }))
        }

        return unexpectedReason("ChainLink", "getById")(error.reason)
      })
    )

    const withdrawEnabled = flag === "deposit" ? existing.withdrawEnabled : !existing.withdrawEnabled
    const depositEnabled = flag === "deposit" ? !existing.depositEnabled : existing.depositEnabled

    const input: ChainLinkUpdate = {
      exchangeChainCode: existing.exchangeChainCode,
      exchangeCryptocurrencyId: existing.exchangeCryptocurrencyId,
      chainId: existing.chainId,
      exchangeChainName: existing.exchangeChainName,
      withdrawEnabled,
      depositEnabled
    }

    yield* links.update(linkId, input).pipe(
      Effect.catchTag("ChainLinkError", (error) => unexpectedReason("ChainLink", "update")(error.reason))
    )

    const parent = yield* markets.getById(existing.exchangeCryptocurrencyId).pipe(
      Effect.asSome,
      Effect.catchTag("MarketError", () => Effect.succeed(Option.none<MarketModel>()))
    )

    if (Option.isNone(parent)) {
      return fragmentResponse(html`<div id="drawer-body"><div class="alert alert-info"><span>Updated.</span></div></div>`)
    }

    const next = flag === "deposit" ? depositEnabled : withdrawEnabled

    return fragmentResponse(
      html`${yield* loadDrawerBody(parent.value.cryptocurrencyId)}${ToastOob({
        kind: "info",
        message: `${flag} ${next ? "on" : "off"}`
      })}`
    )
  }))

/**
 * Every coin-drawer route in the SSR control plane.
 */
export const DrawerRoutes = Layer.mergeAll(
  drawerRoute,
  marketAssignRoute,
  marketUpdateRoute,
  marketDeleteRoute,
  chainLinkAddRoute,
  chainLinkDeleteRoute,
  chainLinkToggleRoute
)
