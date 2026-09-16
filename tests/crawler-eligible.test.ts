import { describe, expect, test } from "bun:test";
import { isEligibleCoin } from "../src/core/crawler/eligible-set";

describe("eligible-set gate (1.3)", () => {
  test("eligible when listed, trade-enabled, one fully-enabled chain", () => {
    expect(
      isEligibleCoin({ listed: true, tradeEnabled: true }, [
        { withdrawEnabled: true, depositEnabled: true },
      ]),
    ).toBe(true);
  });

  test("suspend-removes-eligibility: last enabled chain suspended", () => {
    expect(
      isEligibleCoin({ listed: true, tradeEnabled: true }, [
        { withdrawEnabled: false, depositEnabled: true },
        { withdrawEnabled: true, depositEnabled: false },
      ]),
    ).toBe(false);
  });

  test("partial chain set still eligible via remaining enabled chain", () => {
    expect(
      isEligibleCoin({ listed: true, tradeEnabled: true }, [
        { withdrawEnabled: false, depositEnabled: false },
        { withdrawEnabled: true, depositEnabled: true },
      ]),
    ).toBe(true);
  });

  test("listed=false removes eligibility", () => {
    expect(
      isEligibleCoin({ listed: false, tradeEnabled: true }, [
        { withdrawEnabled: true, depositEnabled: true },
      ]),
    ).toBe(false);
  });

  test("tradeEnabled=false removes eligibility", () => {
    expect(
      isEligibleCoin({ listed: true, tradeEnabled: false }, [
        { withdrawEnabled: true, depositEnabled: true },
      ]),
    ).toBe(false);
  });

  test("no chains means ineligible", () => {
    expect(isEligibleCoin({ listed: true, tradeEnabled: true }, [])).toBe(false);
  });
});
