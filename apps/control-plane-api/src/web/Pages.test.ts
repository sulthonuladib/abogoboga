import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { bodyOf, htmxRequest, withTestApp } from "./testing/App.ts"
import { seedChain, seedCoin, seedExchange } from "./testing/fixtures.ts"

const pageChecks = [
  { path: "/dashboard", marker: "Needs attention" },
  { path: "/coins", marker: "New coin" },
  { path: "/exchanges", marker: "New exchange" },
  { path: "/chains", marker: "New chain" }
] as const

describe("SSR pages", () => {
  test("list pages serve full documents for full loads and fragments for HTMX", async () => {
    const results = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const out: Array<{
            readonly path: string
            readonly marker: string
            readonly fullStatus: number
            readonly fullBody: string
            readonly fragmentStatus: number
            readonly fragmentBody: string
            readonly vary: string | null
          }> = []

          for (const check of pageChecks) {
            const full = yield* app.request(check.path)
            const fragment = yield* htmxRequest(app, check.path)

            out.push({
              path: check.path,
              marker: check.marker,
              fullStatus: full.status,
              fullBody: yield* bodyOf(full),
              fragmentStatus: fragment.status,
              fragmentBody: yield* bodyOf(fragment),
              vary: fragment.headers.get("vary")
            })
          }

          return out
        })
      )
    )

    for (const result of results) {
      expect({ path: result.path, status: result.fullStatus }).toEqual({ path: result.path, status: 200 })
      expect(result.fullBody).toContain("<html")
      expect(result.fullBody).toContain(result.marker)
      expect({ path: result.path, status: result.fragmentStatus }).toEqual({ path: result.path, status: 200 })
      expect(result.fragmentBody).not.toContain("<html")
      expect(result.fragmentBody).toContain(result.marker)
      expect(result.vary).toBe("HX-Request")
    }
  })

  test("detail pages branch on the HTMX request header", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const exchange = yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            coingeckoId: "binance",
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const chain = yield* seedChain(app.services, { name: "Ethereum", code: "ETH" })

          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            coingeckoId: "bitcoin"
          })

          const exchangeFull = yield* bodyOf(yield* app.request(`/exchanges/${String(exchange.id)}`))
          const exchangeFragment = yield* bodyOf(yield* htmxRequest(app, `/exchanges/${String(exchange.id)}`))
          const chainFull = yield* bodyOf(yield* app.request(`/chains/${String(chain.id)}`))
          const chainFragment = yield* bodyOf(yield* htmxRequest(app, `/chains/${String(chain.id)}`))
          const routesFull = yield* app.request(`/coins/${String(coin.id)}/routes`)
          const routesFragment = yield* htmxRequest(app, `/coins/${String(coin.id)}/routes`)

          return {
            exchangeFull,
            exchangeFragment,
            chainFull,
            chainFragment,
            routesFullBody: yield* bodyOf(routesFull),
            routesFragmentBody: yield* bodyOf(routesFragment)
          }
        })
      )
    )

    expect(result.exchangeFull).toContain("<html")
    expect(result.exchangeFull).toContain("Binance")
    expect(result.exchangeFragment).not.toContain("<html")
    expect(result.exchangeFragment).toContain("Binance")
    expect(result.chainFull).toContain("<html")
    expect(result.chainFull).toContain("Ethereum")
    expect(result.chainFragment).not.toContain("<html")
    expect(result.chainFragment).toContain("Ethereum")
    expect(result.routesFullBody).toContain("<html")
    expect(result.routesFragmentBody).not.toContain("<html")
    expect(result.routesFragmentBody).toContain("Routes BTC")
  })

  test("missing entities redirect full loads and set HX-Redirect for HTMX", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const htmxMiss = yield* htmxRequest(app, "/exchanges/999/edit")
          const fullMiss = yield* app.request("/exchanges/999")

          return { htmxMiss, fullMiss }
        })
      )
    )

    expect(result.htmxMiss.status).toBe(200)
    expect(result.htmxMiss.headers.get("hx-redirect")).toBe("/not-found?kind=exchange&id=999")
    expect(result.fullMiss.status).toBe(302)
    expect(result.fullMiss.headers.get("location")).toBe("/not-found?kind=exchange&id=999")
  })

  test("the root redirects and the not-found page reports 404", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const root = yield* app.request("/")
          const notFound = yield* app.request("/not-found?kind=coin&id=7")
          const notFoundHtmx = yield* htmxRequest(app, "/not-found?kind=coin&id=7")

          return {
            root,
            notFoundStatus: notFound.status,
            notFoundBody: yield* bodyOf(notFound),
            notFoundHtmxStatus: notFoundHtmx.status,
            notFoundHtmxBody: yield* bodyOf(notFoundHtmx)
          }
        })
      )
    )

    expect(result.root.status).toBe(302)
    expect(result.root.headers.get("location")).toBe("/dashboard")
    expect(result.notFoundStatus).toBe(404)
    expect(result.notFoundBody).toContain("<html")
    expect(result.notFoundBody).toContain("coin #7")
    expect(result.notFoundHtmxStatus).toBe(404)
    expect(result.notFoundHtmxBody).not.toContain("<html")
    expect(result.notFoundHtmxBody).toContain("coin #7")
  })
})
