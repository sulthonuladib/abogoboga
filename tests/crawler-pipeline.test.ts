import { describe, expect, test } from "bun:test";
import {
  IDR_VOLUME_TARGET,
  convertToIdr,
  getUsdtToIdrRate,
  processTick,
  walkBookSide,
} from "../src/core/crawler/pipeline";
import type { CanonicalTick } from "../src/core/crawler/crawler.contract";

function tick(over: Partial<CanonicalTick> = {}): CanonicalTick {
  return {
    exchangeSlug: "indodax",
    symbol: "BTC",
    cmcId: 1,
    bids: [],
    asks: [],
    timestamp: 1_700_000_000_000,
    ...over,
  };
}

describe("tick pipeline (4.1-4.3)", () => {
  test("single stub-constant rate converts USDT quotes to IDR", () => {
    const rate = getUsdtToIdrRate();
    expect(rate).toBeGreaterThan(0);
    expect(convertToIdr(1, "usdt")).toBe(rate);
    expect(convertToIdr(50000, "idr")).toBe(50000);
  });

  test("2M walk records full-target execution on both sides", () => {
    // 2 levels x 1M IDR each per side, best-first.
    const t = tick({
      bids: [
        [1_000_000, 1],
        [1_000_000, 1],
      ],
      asks: [
        [1_000_000, 1],
        [1_000_000, 1],
      ],
    });
    const out = processTick(t, "idr");
    expect(out).not.toBeNull();
    expect(out!.buyPrice).toBe(1_000_000);
    expect(out!.sellPrice).toBe(1_000_000);
    expect(out!.buyAmount).toBe(2);
    expect(out!.sellAmount).toBe(2);
  });

  test("walk uses marginal price at the target level", () => {
    const t = tick({
      bids: [
        [1_500_000, 1],
        [500_000, 2],
      ],
      asks: [
        [1_500_000, 1],
        [500_000, 2],
      ],
    });
    const out = processTick(t, "idr");
    expect(out?.sellPrice).toBe(500_000);
    expect(out?.buyPrice).toBe(500_000);
  });

  test("USDT-quoted book converts at the stub rate before walking", () => {
    const rate = getUsdtToIdrRate();
    const targetInUsdt = IDR_VOLUME_TARGET / rate;
    const t = tick({
      bids: [[targetInUsdt / 2, 1]],
      asks: [[targetInUsdt / 2, 1]],
    });
    // Single 1M-IDR-equivalent level per side is thin -> null.
    expect(processTick(t, "usdt")).toBeNull();
    const deep = tick({
      bids: [
        [targetInUsdt / 2, 1],
        [targetInUsdt / 2, 1],
      ],
      asks: [
        [targetInUsdt / 2, 1],
        [targetInUsdt / 2, 1],
      ],
    });
    expect(processTick(deep, "usdt")).not.toBeNull();
  });

  test("thin book returns null (skip)", () => {
    expect(walkBookSide([[100, 1]], IDR_VOLUME_TARGET)).toBeNull();
    const t = tick({ bids: [[100, 1]], asks: [[100, 1]] });
    expect(processTick(t, "idr")).toBeNull();
  });
});
