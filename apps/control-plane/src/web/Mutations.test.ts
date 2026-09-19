import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { bodyOf, formBody, htmxRequest, withTestApp } from "./testing/App.ts"
import { seedChain, seedCoin, seedExchange, seedMarket } from "./testing/fixtures.ts"

describe("SSR coin mutations", () => {
  test("create validates input, succeeds, and rejects a duplicate CMC id", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const invalid = yield* htmxRequest(app, "/coins", {
            method: "POST",
            body: formBody({ symbol: "", cmcId: "1" })
          })

          const created = yield* htmxRequest(app, "/coins", {
            method: "POST",
            body: formBody({ symbol: "BTC", name: "Bitcoin", slug: "bitcoin", cmcId: "1", logo: "" })
          })

          const listed = yield* htmxRequest(app, "/partials/coins")

          const duplicate = yield* htmxRequest(app, "/coins", {
            method: "POST",
            body: formBody({ symbol: "BTC2", name: "Bitcoin Cash", slug: "bitcoin-cash", cmcId: "1", logo: "" })
          })

          return {
            invalidBody: yield* bodyOf(invalid),
            createdBody: yield* bodyOf(created),
            listedBody: yield* bodyOf(listed),
            duplicateBody: yield* bodyOf(duplicate)
          }
        })
      )
    )

    expect(result.invalidBody).toContain("symbol is required")
    expect(result.createdBody).toContain("coins-table-wrap")
    expect(result.createdBody).toContain("toast-slot")
    expect(result.createdBody).toContain("hx-swap-oob")
    expect(result.createdBody).toContain("BTC created")
    expect(result.listedBody).toContain("BTC")
    expect(result.duplicateBody).toContain("already used by another coin")
  })

  test("update and delete refresh the table with out-of-band feedback", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            cmcId: 1
          })

          const updated = yield* htmxRequest(app, `/coins/${String(coin.id)}`, {
            method: "POST",
            body: formBody({ symbol: "WBTC", name: "Wrapped Bitcoin", slug: "wrapped-bitcoin", cmcId: "1" })
          })

          const afterUpdate = yield* htmxRequest(app, "/partials/coins")
          const removed = yield* htmxRequest(app, `/coins/${String(coin.id)}`, { method: "DELETE" })
          const afterDelete = yield* htmxRequest(app, "/partials/coins")

          return {
            updatedBody: yield* bodyOf(updated),
            afterUpdateBody: yield* bodyOf(afterUpdate),
            removedBody: yield* bodyOf(removed),
            afterDeleteBody: yield* bodyOf(afterDelete)
          }
        })
      )
    )

    expect(result.updatedBody).toContain("WBTC saved")
    expect(result.afterUpdateBody).toContain("WBTC")
    expect(result.removedBody).toContain("WBTC deleted")
    expect(result.removedBody).toContain("coins-count")
    expect(result.afterDeleteBody).not.toContain("WBTC")
  })
})

describe("SSR exchange mutations", () => {
  test("create, update, and delete with a market-assignment guard", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            cmcId: 1
          })

          const guarded = yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            cmcId: 270,
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const free = yield* seedExchange(app.services, {
            name: "Kraken",
            slug: "kraken",
            cmcId: 24,
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          yield* seedMarket(app.services, {
            exchangeId: guarded.id,
            cryptocurrencyId: coin.id,
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          })

          const blocked = yield* htmxRequest(app, `/exchanges/${String(guarded.id)}`, { method: "DELETE" })
          const listed = yield* htmxRequest(app, "/partials/exchanges")
          const removed = yield* htmxRequest(app, `/exchanges/${String(free.id)}`, { method: "DELETE" })

          const missingName = yield* htmxRequest(app, "/exchanges", {
            method: "POST",
            body: formBody({ name: "", slug: "" })
          })

          const created = yield* htmxRequest(app, "/exchanges", {
            method: "POST",
            body: formBody({ name: "Coinbase", slug: "coinbase", cmcId: "89", baseCurrency: "usdt" })
          })

          const afterCreate = yield* htmxRequest(app, "/partials/exchanges")

          return {
            blockedBody: yield* bodyOf(blocked),
            listedBody: yield* bodyOf(listed),
            removedBody: yield* bodyOf(removed),
            missingNameBody: yield* bodyOf(missingName),
            createdBody: yield* bodyOf(created),
            afterCreateBody: yield* bodyOf(afterCreate)
          }
        })
      )
    )

    expect(result.blockedBody).toContain("market assignments")
    expect(result.listedBody).toContain("Binance")
    expect(result.removedBody).toContain("exchange deleted")
    expect(result.missingNameBody).toContain("name is required")
    expect(result.createdBody).toContain("Coinbase created")
    expect(result.afterCreateBody).toContain("Coinbase")
  })
})

describe("SSR chain mutations", () => {
  test("create rejects a duplicate code and delete is guarded by chain links", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const ethereum = yield* seedChain(app.services, { name: "Ethereum", code: "ETH" })
          const free = yield* seedChain(app.services, { name: "Solana", code: "SOL" })

          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            cmcId: 1
          })

          const exchange = yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            cmcId: 270,
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const market = yield* seedMarket(app.services, {
            exchangeId: exchange.id,
            cryptocurrencyId: coin.id,
            exchangeSymbol: "BTCUSDT",
            listed: true,
            tradeEnabled: true
          })

          yield* htmxRequest(app, `/partials/markets/${String(market.id)}/chains`, {
            method: "POST",
            body: formBody({ chainId: String(ethereum.id), exchangeChainCode: "ERC20" })
          })

          const duplicate = yield* htmxRequest(app, "/chains", {
            method: "POST",
            body: formBody({ name: "Ether", code: "ETH" })
          })

          const blocked = yield* htmxRequest(app, `/chains/${String(ethereum.id)}`, { method: "DELETE" })
          const removed = yield* htmxRequest(app, `/chains/${String(free.id)}`, { method: "DELETE" })

          return {
            duplicateBody: yield* bodyOf(duplicate),
            blockedBody: yield* bodyOf(blocked),
            removedBody: yield* bodyOf(removed)
          }
        })
      )
    )

    expect(result.duplicateBody).toContain("already used by another chain")
    expect(result.blockedBody).toContain("referenced by")
    expect(result.removedBody).toContain("chain deleted")
  })
})

describe("SSR drawer mutations", () => {
  test("assign, update, link, toggle, and unassign update the drawer body", async () => {
    const result = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const coin = yield* seedCoin(app.services, {
            symbol: "BTC",
            name: "Bitcoin",
            slug: "bitcoin",
            logo: "https://example.com/btc.png",
            cmcId: 1
          })

          const exchange = yield* seedExchange(app.services, {
            name: "Binance",
            slug: "binance",
            cmcId: 270,
            logo: "https://example.com/exchange.png",
            registeredOnCmc: true,
            baseCurrency: "usdt"
          })

          const chain = yield* seedChain(app.services, { name: "Ethereum", code: "ETH" })
          const drawerPath = `/partials/coins/${String(coin.id)}`

          const noExchange = yield* htmxRequest(app, `${drawerPath}/markets`, {
            method: "POST",
            body: formBody({ exchangeId: "", exchangeSymbol: "BTCUSDT" })
          })

          const assigned = yield* htmxRequest(app, `${drawerPath}/markets`, {
            method: "POST",
            body: formBody({ exchangeId: String(exchange.id), exchangeSymbol: "BTCUSDT" })
          })

          const duplicate = yield* htmxRequest(app, `${drawerPath}/markets`, {
            method: "POST",
            body: formBody({ exchangeId: String(exchange.id), exchangeSymbol: "BTCUSDT" })
          })

          const assignedBody = yield* bodyOf(assigned)
          const marketId = /market-(\d+)/.exec(assignedBody)?.[1] ?? ""

          const saved = yield* htmxRequest(app, `/partials/markets/${marketId}/update`, {
            method: "POST",
            body: formBody({ exchangeSymbol: "BTCUSDT", tradeEnabled: "on" })
          })

          const linked = yield* htmxRequest(app, `/partials/markets/${marketId}/chains`, {
            method: "POST",
            body: formBody({ chainId: String(chain.id), exchangeChainCode: "ERC20" })
          })

          const linkedBody = yield* bodyOf(linked)
          const linkId = /chain-link-(\d+)/.exec(linkedBody)?.[1] ?? ""

          const toggled = yield* htmxRequest(app, `/partials/chain-links/${linkId}/toggle?flag=deposit`, {
            method: "POST"
          })

          const removedLink = yield* htmxRequest(app, `/partials/chain-links/${linkId}`, { method: "DELETE" })
          const unassigned = yield* htmxRequest(app, `/partials/markets/${marketId}`, { method: "DELETE" })

          return {
            noExchangeBody: yield* bodyOf(noExchange),
            assignedBody,
            duplicateBody: yield* bodyOf(duplicate),
            savedBody: yield* bodyOf(saved),
            linkedBody,
            toggledBody: yield* bodyOf(toggled),
            removedLinkBody: yield* bodyOf(removedLink),
            unassignedBody: yield* bodyOf(unassigned)
          }
        })
      )
    )

    expect(result.noExchangeBody).toContain("select an exchange")
    expect(result.assignedBody).toContain("market assigned")
    expect(result.assignedBody).toContain("BTCUSDT")
    expect(result.duplicateBody).toContain("already exists")
    expect(result.savedBody).toContain("market saved")
    expect(result.linkedBody).toContain("chain linked")
    expect(result.linkedBody).toContain("ETH")
    expect(result.toggledBody).toContain("deposit off")
    expect(result.removedLinkBody).toContain("chain link removed")
    expect(result.unassignedBody).toContain("market unassigned")
  })
})
