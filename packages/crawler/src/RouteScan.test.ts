import { describe, expect, test } from "bun:test"
import { scanRoutes, type RouteLinkRow } from "./RouteScan.ts"

const row = (over: Partial<RouteLinkRow> = {}): RouteLinkRow => ({
  exchangeId: 1,
  cryptocurrencyId: 1,
  symbol: "BTC",
  coingeckoId: "bitcoin",
  listed: true,
  tradeEnabled: true,
  chainId: 1,
  withdrawEnabled: true,
  depositEnabled: true,
  ...over
})

const symbolsFor = (result: ReturnType<typeof scanRoutes>, exchangeId: number): ReadonlyArray<string> =>
  result.subscriptions.find((subscription) => subscription.exchangeId === exchangeId)?.coins
    .map((coin) => coin.symbol)
    .sort() ?? []

describe("route scan", () => {
  test("an exchange with no counterpart has no subscriptions or pairs", () => {
    const result = scanRoutes([row()], [1])

    expect(result.subscriptions).toEqual([{ exchangeId: 1, coins: [] }])
    expect(result.pairs).toEqual([])
  })

  test("a two-way BTC route yields both ordered pairs", () => {
    const result = scanRoutes(
      [
        row({ exchangeId: 1, chainId: 1 }),
        row({ exchangeId: 2, chainId: 1 })
      ],
      [1, 2]
    )

    expect(symbolsFor(result, 1)).toEqual(["BTC"])
    expect(symbolsFor(result, 2)).toEqual(["BTC"])
    expect(result.pairs).toEqual([
      { cryptocurrencyId: 1, buyExchangeId: 1, sellExchangeId: 2 },
      { cryptocurrencyId: 1, buyExchangeId: 2, sellExchangeId: 1 }
    ])
  })

  test("a one-way ETH route yields a single ordered pair", () => {
    const result = scanRoutes(
      [
        row({ cryptocurrencyId: 2, symbol: "ETH", coingeckoId: "ethereum", exchangeId: 1, withdrawEnabled: true, depositEnabled: false }),
        row({ cryptocurrencyId: 2, symbol: "ETH", coingeckoId: "ethereum", exchangeId: 2, withdrawEnabled: false, depositEnabled: true })
      ],
      [1, 2]
    )

    expect(symbolsFor(result, 1)).toEqual(["ETH"])
    expect(symbolsFor(result, 2)).toEqual(["ETH"])
    expect(result.pairs).toEqual([
      { cryptocurrencyId: 2, buyExchangeId: 1, sellExchangeId: 2 }
    ])
  })

  test("an unlisted market is not route-eligible and forms no pair", () => {
    const result = scanRoutes(
      [
        row({ exchangeId: 1 }),
        row({ exchangeId: 2, listed: false })
      ],
      [1, 2]
    )

    expect(symbolsFor(result, 1)).toEqual([])
    expect(symbolsFor(result, 2)).toEqual([])
    expect(result.pairs).toEqual([])
  })

  test("a market with trading disabled forms no route", () => {
    const result = scanRoutes(
      [
        row({ exchangeId: 1 }),
        row({ exchangeId: 2, tradeEnabled: false })
      ],
      [1, 2]
    )

    expect(result.pairs).toEqual([])
    expect(symbolsFor(result, 1)).toEqual([])
  })

  test("a chain present on only one side carries no route", () => {
    const result = scanRoutes(
      [
        row({ exchangeId: 1, chainId: 1, withdrawEnabled: true, depositEnabled: true }),
        row({ exchangeId: 2, chainId: 2, withdrawEnabled: true, depositEnabled: true })
      ],
      [1, 2]
    )

    expect(result.pairs).toEqual([])
    expect(symbolsFor(result, 1)).toEqual([])
    expect(symbolsFor(result, 2)).toEqual([])
  })

  test("an inactive exchange is not considered", () => {
    const result = scanRoutes(
      [
        row({ exchangeId: 1 }),
        row({ exchangeId: 2 })
      ],
      [1]
    )

    expect(symbolsFor(result, 1)).toEqual([])
    expect(result.subscriptions.some((subscription) => subscription.exchangeId === 2)).toBe(false)
    expect(result.pairs).toEqual([])
  })

  test("closing a deposit removes one direction and keeps the reverse", () => {
    const before = scanRoutes(
      [
        row({ exchangeId: 1 }),
        row({ exchangeId: 2 })
      ],
      [1, 2]
    )

    expect(before.pairs).toHaveLength(2)

    const after = scanRoutes(
      [
        row({ exchangeId: 1, withdrawEnabled: true, depositEnabled: true }),
        row({ exchangeId: 2, withdrawEnabled: true, depositEnabled: false })
      ],
      [1, 2]
    )

    expect(after.pairs).toEqual([
      { cryptocurrencyId: 1, buyExchangeId: 2, sellExchangeId: 1 }
    ])
    expect(symbolsFor(after, 1)).toEqual(["BTC"])
    expect(symbolsFor(after, 2)).toEqual(["BTC"])
  })
})
