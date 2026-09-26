import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { bodyOf, htmxRequest, withTestApp } from "./testing/App.ts"
import { seedChain, seedChainLink, seedCoin, seedExchange, seedMarket } from "./testing/fixtures.ts"

describe("SSR partials", () => {
  test("table and option partials render seeded rows", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            coingeckoId: "bitcoin"
          })
          yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            coingeckoId: "binance",
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })
          yield* seedChain(app.services, { name: "Ethereum", code: "ETH" })

          const coins = yield* htmxRequest(app, "/partials/coins")
          const exchanges = yield* htmxRequest(app, "/partials/exchanges")
          const chains = yield* htmxRequest(app, "/partials/chains")
          const exchangeOptions = yield* htmxRequest(app, "/partials/exchanges/options?q=Bin")
          const chainOptions = yield* htmxRequest(app, "/partials/chains/options?q=Eth")
          const empty = yield* htmxRequest(app, "/partials/empty")

          return {
            coinsBody: yield* bodyOf(coins),
            coinsVary: coins.headers.get("vary"),
            exchangesBody: yield* bodyOf(exchanges),
            chainsBody: yield* bodyOf(chains),
            exchangeOptionsBody: yield* bodyOf(exchangeOptions),
            chainOptionsBody: yield* bodyOf(chainOptions),
            emptyBody: yield* bodyOf(empty)
          }
        })
      )
    )

    expect(result.coinsBody).toContain("coins-table-wrap")
    expect(result.coinsBody).toContain("BTC")
    expect(result.coinsVary).toBe("HX-Request")
    expect(result.exchangesBody).toContain("exchanges-table-wrap")
    expect(result.exchangesBody).toContain("Binance")
    expect(result.chainsBody).toContain("chains-table-wrap")
    expect(result.chainsBody).toContain("Ethereum")
    expect(result.exchangeOptionsBody).toContain("Binance")
    expect(result.chainOptionsBody).toContain("Ethereum")
    expect(result.emptyBody.trim()).toBe("")
  })

  test("drawer and routes partials expose market and transfer detail", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            coingeckoId: "bitcoin"
          })

          const binance = yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            coingeckoId: "binance",
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const kraken = yield* seedExchange(app.services, {
            name: "Kraken",
            slug: "kraken",
            coingeckoId: "kraken",
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const ethereum = yield* seedChain(app.services, { name: "Ethereum", code: "ETH" })

          const firstMarket = yield* seedMarket(app.services, {
            exchangeId: binance.id,
            cryptocurrencyId: coin.id,
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          })

          const secondMarket = yield* seedMarket(app.services, {
            exchangeId: kraken.id,
            cryptocurrencyId: coin.id,
            exchangeSymbol: "XBTUSD",
            listed: true,
            tradeEnabled: true
          })

          yield* seedChainLink(app.services, {
            exchangeCryptocurrencyId: firstMarket.id,
            chainId: ethereum.id,
            exchangeChainCode: "ERC20",
            exchangeChainName: null,
            withdrawEnabled: true,
            depositEnabled: true
          })
          yield* seedChainLink(app.services, {
            exchangeCryptocurrencyId: secondMarket.id,
            chainId: ethereum.id,
            exchangeChainCode: "ERC20",
            exchangeChainName: null,
            withdrawEnabled: true,
            depositEnabled: true
          })

          const drawer = yield* htmxRequest(app, `/partials/coins/${String(coin.id)}/drawer`)
          const matrix = yield* htmxRequest(app, `/partials/coins/${String(coin.id)}/routes`)

          const detail = yield* htmxRequest(
            app,
            `/partials/coins/${String(coin.id)}/routes/detail?from=${String(firstMarket.id)}&to=${String(secondMarket.id)}`
          )

          const missingDrawer = yield* htmxRequest(app, "/partials/coins/999/drawer")

          return {
            drawerBody: yield* bodyOf(drawer),
            matrixBody: yield* bodyOf(matrix),
            detailBody: yield* bodyOf(detail),
            missingDrawerRedirect: missingDrawer.headers.get("hx-redirect")
          }
        })
      )
    )

    expect(result.drawerBody).toContain("drawer-body")
    expect(result.drawerBody).toContain("BTCUSDT")
    expect(result.drawerBody).toContain("XBTUSD")
    expect(result.matrixBody).toContain("routes-matrix")
    expect(result.matrixBody).toContain("Binance")
    expect(result.detailBody).toContain("Route Binance → Kraken")
    expect(result.detailBody).toContain("ETH")
    expect(result.missingDrawerRedirect).toBe("/not-found?kind=coin&id=999")
  })
})
