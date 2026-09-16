import type { CanonicalTick, PriceLevel } from "./crawler.contract";
import { OrderbookSnapshot } from "../orderbook/orderbook";

// Fixed 2M IDR executable-depth target shared by every exchange.
export const IDR_VOLUME_TARGET = 2_000_000;

// Single stub-constant call site for the USDT/IDR rate until the cache cron
// exists. Replace this function body; every conversion flows through it.
export function getUsdtToIdrRate(): number {
  return 16_000;
}

export type QuoteCurrency = "usdt" | "idr";

export function convertToIdr(price: number, quote: QuoteCurrency): number {
  if (quote === "idr") return price;
  return price * getUsdtToIdrRate();
}

export type BookWalk = { price: number; amount: number; value: number };

// Walk one side best-first, accumulating price*qty until the cumulative value
// reaches the target. Returns the marginal execution price, total base amount,
// and cumulative value, or null when the side totals below target (thin).
export function walkBookSide(
  levelsIdr: PriceLevel[],
  target: number = IDR_VOLUME_TARGET,
): BookWalk | null {
  let value = 0;
  let amount = 0;
  let price = 0;
  for (const [p, q] of levelsIdr) {
    if (!(p > 0) || !(q > 0)) continue;
    price = p;
    amount += q;
    value += p * q;
    if (value >= target) return { price, amount, value };
  }
  return null;
}

export type PipelineQuote = {
  buyPrice: number;
  sellPrice: number;
  buyAmount: number;
  sellAmount: number;
};

// Buy lifts asks, sell hits bids. All book prices are converted to IDR before
// the walk using the single rate source. Returns null on thin book so the
// caller leaves the stored snapshot untouched.
export function processTick(
  tick: CanonicalTick,
  quote: QuoteCurrency,
): PipelineQuote | null {
  const bidsIdr: PriceLevel[] = tick.bids.map(([p, q]) => [convertToIdr(p, quote), q]);
  const asksIdr: PriceLevel[] = tick.asks.map(([p, q]) => [convertToIdr(p, quote), q]);
  const bidWalk = walkBookSide(bidsIdr);
  const askWalk = walkBookSide(asksIdr);
  if (!bidWalk || !askWalk) return null;
  return {
    buyPrice: askWalk.price,
    sellPrice: bidWalk.price,
    buyAmount: askWalk.amount,
    sellAmount: bidWalk.amount,
  };
}

export type TickIdentity = {
  exchangeId: number;
  exchangeCryptocurrencyId: number;
};

export async function handleTick(
  tick: CanonicalTick,
  identity: TickIdentity,
  quote: QuoteCurrency,
  upsert: typeof OrderbookSnapshot.upsert = OrderbookSnapshot.upsert,
): Promise<boolean> {
  const quoteOut = processTick(tick, quote);
  if (!quoteOut) return false; // thin book: snapshot untouched
  await upsert({
    exchangeId: identity.exchangeId,
    exchangeCryptocurrencyId: identity.exchangeCryptocurrencyId,
    buyPrice: quoteOut.buyPrice,
    sellPrice: quoteOut.sellPrice,
    buyAmount: quoteOut.buyAmount,
    sellAmount: quoteOut.sellAmount,
    tickTimestamp: tick.timestamp,
  });
  return true;
}
