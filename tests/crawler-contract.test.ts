import { describe, expect, test } from "bun:test";
import {
  formatBootstrapCoins,
  parseBootstrapCoins,
  parseCanonicalTick,
  parseWorkerCommand,
  WORKER_ARGV_INDEX,
  WORKER_ARGV_MARKER,
} from "../src/core/crawler/crawler.contract";

describe("crawler contract types (1.1)", () => {
  test("canonical tick accepts coin identity plus books and timestamp", () => {
    expect(
      parseCanonicalTick(
        JSON.stringify({
          exchangeSlug: "indodax",
          symbol: "BTC",
          cmcId: 1,
          bids: [[100, 1]],
          asks: [[101, 1]],
          timestamp: Date.now(),
        }),
      ),
    ).not.toBeNull();
  });

  test("stdin subscribe/unsubscribe commands validate coin lists", () => {
    expect(
      parseWorkerCommand(
        JSON.stringify({ type: "subscribe", coins: [{ symbol: "BTC", cmcId: 1 }] }),
      ),
    ).not.toBeNull();
    expect(
      parseWorkerCommand(
        JSON.stringify({ type: "unsubscribe", coins: [{ symbol: "ETH", cmcId: 1027 }] }),
      ),
    ).not.toBeNull();
    expect(parseWorkerCommand(JSON.stringify({ type: "halt", coins: [] }))).toBeNull();
  });

  test("bootstrap coin list round-trips through argv format", () => {
    const coins = [
      { symbol: "BTC", cmcId: 1 },
      { symbol: "ETH", cmcId: 1027 },
    ];
    expect(parseBootstrapCoins(formatBootstrapCoins(coins))).toEqual(coins);
    expect(parseBootstrapCoins("")).toEqual([]);
  });

  test("argv contract documents index-2 marker", () => {
    expect(WORKER_ARGV_MARKER).toBe("--crawler-worker");
    expect(WORKER_ARGV_INDEX.marker).toBe(2);
    expect(WORKER_ARGV_INDEX.coins).toBe(5);
  });
});
