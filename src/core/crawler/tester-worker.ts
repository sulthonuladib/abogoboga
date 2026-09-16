// Canonical dummy worker for testing. Implements the worker side of the
// crawler contract with synthetic data: no exchange websocket connection.
//
// Argv: bun <this-file> --crawler-worker <exchangeSlug> <shardId> <coins>
// stdin: JSONL subscribe/unsubscribe commands. stdout: JSONL canonical ticks
// with dummy books. stderr: logs only. stdin EOF triggers self-exit.
// Secrets via env only.
//
// Test-only. Production exchange workers are owner-implemented against
// docs/crawler-worker-contract.md; this file is the runnable reference.
import {
  WORKER_ARGV_INDEX,
  WORKER_ARGV_MARKER,
  formatBootstrapCoins,
  parseBootstrapCoins,
  parseWorkerCommand,
  type BootstrapCoin,
  type CanonicalTick,
} from "./crawler.contract";

const argv = Bun.argv;
if (argv[WORKER_ARGV_INDEX.marker] !== WORKER_ARGV_MARKER) {
  console.error(
    `dummy-worker: expected argv[2]="${WORKER_ARGV_MARKER}" got "${argv[WORKER_ARGV_INDEX.marker] ?? ""}"`,
  );
  process.exit(2);
}
const exchangeSlug = argv[WORKER_ARGV_INDEX.exchange] ?? "unknown";
const shardId = argv[WORKER_ARGV_INDEX.shard] ?? "shard-0";
let subscribed: BootstrapCoin[] = [];
try {
  subscribed = parseBootstrapCoins(argv[WORKER_ARGV_INDEX.coins]);
} catch (error) {
  console.error(`dummy-worker: invalid bootstrap coins: ${(error as Error).message}`);
  process.exit(2);
}
const live = new Map<string, BootstrapCoin>();
for (const c of subscribed) live.set(`${c.symbol}:${c.cmcId}`, c);

console.error(`dummy-worker ${exchangeSlug}/${shardId} boot coins=${formatBootstrapCoins(subscribed)}`);

function emitTick(coin: BootstrapCoin) {
  const base = 100 + (coin.cmcId % 100);
  const tick: CanonicalTick = {
    exchangeSlug,
    symbol: coin.symbol,
    cmcId: coin.cmcId,
    bids: [
      [base, 1],
      [base - 1, 2],
    ],
    asks: [
      [base + 1, 1],
      [base + 2, 2],
    ],
    timestamp: Date.now(),
  };
  process.stdout.write(`${JSON.stringify(tick)}\n`);
}

const timer = setInterval(() => {
  for (const coin of live.values()) emitTick(coin);
}, 50);
timer.unref?.();

// Stdin command loop. EOF (parent gone) => self-terminate per contract.
async function runStdin() {
  const decoder = new TextDecoder();
  let buf = "";
  const stdin = Bun.stdin.stream();
  const reader = stdin.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const cmd = parseWorkerCommand(line);
        if (!cmd) {
          console.error(`dummy-worker: ignoring invalid command: ${line}`);
          continue;
        }
        if (cmd.type === "subscribe") {
          for (const c of cmd.coins) live.set(`${c.symbol}:${c.cmcId}`, c);
          console.error(
            `dummy-worker: subscribed ${formatBootstrapCoins(cmd.coins)} count=${live.size}`,
          );
        } else {
          for (const c of cmd.coins) live.delete(`${c.symbol}:${c.cmcId}`);
          console.error(
            `dummy-worker: unsubscribed ${formatBootstrapCoins(cmd.coins)} count=${live.size}`,
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  clearInterval(timer);
  process.exit(0);
}

await runStdin();
