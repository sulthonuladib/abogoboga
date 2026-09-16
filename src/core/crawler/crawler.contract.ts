// Canonical worker contract shared by the parent supervisor and every
// owner-implemented exchange worker. JSONL on stdin/stdout, logs on stderr.
//
// Plain TypeScript types only: this contract never touches HTTP, so Zod stays
// at the oRPC boundary (router inputs/outputs, drizzle-zod table schemas).
// Untrusted worker I/O is validated by the small parsers below.

export type BootstrapCoin = {
  symbol: string;
  cmcId: number;
};

export type PriceLevel = [price: number, quantity: number];

export type CanonicalTick = {
  exchangeSlug: string;
  symbol: string;
  cmcId: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: number;
};

export type SubscribeCommand = {
  type: "subscribe";
  coins: BootstrapCoin[];
};

export type UnsubscribeCommand = {
  type: "unsubscribe";
  coins: BootstrapCoin[];
};

export type WorkerCommand = SubscribeCommand | UnsubscribeCommand;

// Argv bootstrap: `bun <script> --crawler-worker <exchangeSlug> <shardId> <coins>`
// where <coins> is `SYM:cmcId,...` (empty string = no coins).
// Script-form user args start at Bun.argv[2], hence the documented indices:
// argv[2] marker, argv[3] exchange, argv[4] shard, argv[5] coins.
export const WORKER_ARGV_MARKER = "--crawler-worker";
export const WORKER_ARGV_INDEX = { marker: 2, exchange: 3, shard: 4, coins: 5 } as const;

export function formatBootstrapCoins(coins: BootstrapCoin[]): string {
  return coins.map((c) => `${c.symbol}:${c.cmcId}`).join(",");
}

function toCmcId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

function isBootstrapCoin(value: unknown): value is BootstrapCoin {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.symbol !== "string" || v.symbol.length === 0) return false;
  return toCmcId(v.cmcId) !== null;
}

function normalizeCoin(value: unknown): BootstrapCoin | null {
  if (!isBootstrapCoin(value)) return null;
  const v = value as { symbol: string; cmcId: unknown };
  return { symbol: v.symbol, cmcId: toCmcId(v.cmcId)! };
}

export function parseBootstrapCoins(arg: string | undefined): BootstrapCoin[] {
  if (!arg) return [];
  const out: BootstrapCoin[] = [];
  for (const part of arg.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sep = trimmed.lastIndexOf(":");
    if (sep <= 0) throw new Error(`invalid bootstrap coin: ${trimmed}`);
    const symbol = trimmed.slice(0, sep);
    const cmcId = toCmcId(trimmed.slice(sep + 1));
    if (!symbol || cmcId === null) throw new Error(`invalid bootstrap coin: ${trimmed}`);
    out.push({ symbol, cmcId });
  }
  return out;
}

function isPriceLevel(value: unknown): value is PriceLevel {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function isPriceLevelArray(value: unknown): value is PriceLevel[] {
  return Array.isArray(value) && value.every(isPriceLevel);
}

// Parse one stdout line into a CanonicalTick. Returns null for blank or
// malformed lines; callers skip nulls (stderr is the log channel).
export function parseCanonicalTick(line: string): CanonicalTick | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.exchangeSlug !== "string" || v.exchangeSlug.length === 0) return null;
  if (typeof v.symbol !== "string" || v.symbol.length === 0) return null;
  const cmcId = toCmcId(v.cmcId);
  if (cmcId === null) return null;
  if (!isPriceLevelArray(v.bids) || !isPriceLevelArray(v.asks)) return null;
  if (typeof v.timestamp !== "number" || !Number.isInteger(v.timestamp)) return null;
  return {
    exchangeSlug: v.exchangeSlug,
    symbol: v.symbol,
    cmcId,
    bids: v.bids,
    asks: v.asks,
    timestamp: v.timestamp,
  };
}

// Parse one stdin line into a WorkerCommand. Returns null for blank or
// malformed lines; callers log-and-ignore them.
export function parseWorkerCommand(line: string): WorkerCommand | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (v.type !== "subscribe" && v.type !== "unsubscribe") return null;
  if (!Array.isArray(v.coins) || v.coins.length === 0) return null;
  const coins: BootstrapCoin[] = [];
  for (const item of v.coins) {
    const coin = normalizeCoin(item);
    if (!coin) return null;
    coins.push(coin);
  }
  return v.type === "subscribe" ? { type: "subscribe", coins } : { type: "unsubscribe", coins };
}
