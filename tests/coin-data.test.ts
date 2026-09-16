import { describe, expect, test } from "bun:test";
import { mapCoinData, parseCoinData } from "../src/seed/coin-data";

const fixture = [
  {
    cmcId: 1,
    name: "Bitcoin",
    symbol: "btc",
    slug: "bitcoin",
    logo: "https://example.test/btc.png",
    binance: true,
    binanceAlternateSymbol: "BTCUSDT",
    huobi: true,
    huobiAlternateSymbol: "BTC",
    bybit: false,
  },
  {
    cmcId: 2,
    name: "USD Coin",
    symbol: "usdc",
    slug: "usd-coin",
    logo: "https://example.test/usdc.png",
  },
];

describe("coin data import mapping", () => {
  test("maps only explicitly enabled exchanges and supports huobi as HTX", () => {
    const plan = mapCoinData(fixture);
    expect(plan.coins).toHaveLength(2);
    expect(plan.assignments).toEqual([
      { exchangeKey: "binance", cmcId: 1, exchangeSymbol: "BTCUSDT" },
      { exchangeKey: "htx", cmcId: 1, exchangeSymbol: "BTC" },
    ]);
  });

  test("accepts an API-style data wrapper and defaults optional logo", () => {
    const parsed = parseCoinData({
      data: [{ cmcId: 7, name: "Test", symbol: "tst", slug: "test" }],
    });
    expect(parsed[0]?.logo).toBe("");
    expect(mapCoinData(parsed).assignments).toHaveLength(0);
  });
});
