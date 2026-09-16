import { describe, expect, test } from "bun:test";
import {
  Supervisor,
  bootSupervisor,
  buildWorkerArgv,
  shardCoins,
  type WorkerProc,
} from "../src/core/crawler/supervisor";
import { WORKER_ARGV_MARKER, type BootstrapCoin } from "../src/core/crawler/crawler.contract";
import type { CanonicalTick } from "../src/core/crawler/crawler.contract";

const DUMMY = new URL("./fixtures/dummy-worker.ts", import.meta.url).pathname;

function coins(n: number, from = 1): BootstrapCoin[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol: `C${from + i}`,
    cmcId: from + i,
  }));
}

async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await Bun.sleep(25);
  }
}

describe("shard placement (3.3)", () => {
  test("start with 19 coins spawns exactly one shard", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(1, "ex", coins(19));
      expect(sup.shardSizes(1)).toEqual([19]);
    } finally {
      await sup.shutdown();
    }
  });

  test("start with 45 coins spawns three shards capped at 20", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(2, "ex", coins(45));
      expect(sup.shardSizes(2)).toEqual([20, 20, 5]);
    } finally {
      await sup.shutdown();
    }
  });

  test("start already-running returns without duplicates", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(3, "ex", coins(5));
      await sup.startExchange(3, "ex", coins(5));
      expect(sup.shardSizes(3)).toEqual([5]);
    } finally {
      await sup.shutdown();
    }
  });

  test("first-fit: coin fills the 19/20 shard with no new spawn", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(4, "ex", coins(39));
      expect(sup.shardSizes(4)).toEqual([20, 19]);
      await sup.addCoins(4, [{ symbol: "NEW", cmcId: 999 }]);
      expect(sup.shardSizes(4)).toEqual([20, 20]);
    } finally {
      await sup.shutdown();
    }
  });

  test("spawn-when-full: new shard when all shards at capacity", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(5, "ex", coins(20));
      await sup.addCoins(5, [{ symbol: "NEW", cmcId: 999 }]);
      expect(sup.shardSizes(5)).toEqual([20, 1]);
    } finally {
      await sup.shutdown();
    }
  });

  test("shrink-on-empty: last coin removed terminates the shard", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      const all = coins(21);
      await sup.startExchange(6, "ex", all);
      expect(sup.shardSizes(6)).toEqual([20, 1]);
      const last = all[20]!;
      await sup.removeCoins(6, [last]);
      expect(sup.shardSizes(6)).toEqual([20]);
    } finally {
      await sup.shutdown();
    }
  });

  test("stop removes desired set and terminates without respawn", async () => {
    const sup = new Supervisor({ workerScript: DUMMY });
    try {
      await sup.startExchange(7, "ex", coins(5));
      expect(sup.isRunning(7)).toBe(true);
      await sup.stopExchange(7);
      expect(sup.isRunning(7)).toBe(false);
    } finally {
      await sup.shutdown();
    }
  });

  test("shardCoins helper chunks at capacity", () => {
    expect(shardCoins(coins(19)).map((c) => c.length)).toEqual([19]);
    expect(shardCoins(coins(45)).map((c) => c.length)).toEqual([20, 20, 5]);
  });

  test("worker argv carries marker signature and bootstrap coins", () => {
    const argv = buildWorkerArgv("worker.ts", "indodax", "shard-1", [
      { symbol: "BTC", cmcId: 1 },
    ]);
    expect(argv).toEqual([
      "bun",
      "worker.ts",
      WORKER_ARGV_MARKER,
      "indodax",
      "shard-1",
      "BTC:1",
    ]);
  });
});

describe("boot sweep (3.5)", () => {
  test("sweep terminates a planted argv-signature orphan and boots with zero running", async () => {
    const orphan = Bun.spawn(
      ["bun", DUMMY, WORKER_ARGV_MARKER, "orphan-ex", "shard-9", "BTC:1"],
      { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
    );
    try {
      const sup = new Supervisor({ workerScript: DUMMY });
      const res = await bootSupervisor(sup);
      expect(res.killed).toContain(orphan.pid);
      expect(res.running).toBe(0);
      await Promise.race([
        orphan.exited,
        Bun.sleep(5000).then(() => {
          throw new Error("planted orphan was not swept");
        }),
      ]);
    } finally {
      try {
        orphan.kill(9);
      } catch {
        // Already reaped.
      }
    }
  });
});

describe("dummy worker integration (3.1/3.2/3.4)", () => {
  test("spawn delivers bootstrap set; stdin subscribe adds coins; logs stay on stderr", async () => {
    const ticks: CanonicalTick[] = [];
    const logs: string[] = [];
    const sup = new Supervisor({
      workerScript: DUMMY,
      respawnDelayMs: () => 10,
      onTick: (t) => {
        ticks.push(t);
      },
      onLog: (l) => {
        logs.push(l);
      },
    });
    await sup.startExchange(8, "dummy-ex", [{ symbol: "BTC", cmcId: 1 }]);
    await waitFor(() => ticks.some((t) => t.symbol === "BTC"));
    expect(logs.some((l) => l.includes("boot"))).toBe(true);

    await sup.addCoins(8, [{ symbol: "ETH", cmcId: 1027 }]);
    await waitFor(() => ticks.some((t) => t.symbol === "ETH"));
    // Ticks never contain log text; logs captured separately.
    expect(ticks.every((t) => typeof t.cmcId === "number")).toBe(true);
    expect(logs.some((l) => l.includes("subscribed"))).toBe(true);

    // Suspend/delist over live stdin, then stop.
    await sup.removeCoins(8, [{ symbol: "ETH", cmcId: 1027 }]);
    await waitFor(() => logs.some((l) => l.includes("unsubscribed")));
    expect(sup.shardSizes(8)).toEqual([1]);
    await sup.stopExchange(8);
    expect(sup.isRunning(8)).toBe(false);
    await sup.shutdown();
  });

  test("crash respawn replays the last-known coin set", async () => {
    const ticks: CanonicalTick[] = [];
    const sup = new Supervisor({
      workerScript: DUMMY,
      respawnDelayMs: () => 10,
      onTick: (t) => {
        ticks.push(t);
      },
    });
    await sup.startExchange(9, "dummy-ex", [{ symbol: "BTC", cmcId: 1 }]);
    await waitFor(() => ticks.length > 0);
    // SAFETY: tests reach into supervisor state to simulate a crash.
    const shards = (sup as unknown as { shards: Map<number, { proc: WorkerProc }[]> }).shards.get(9)!;
    const firstPid = shards[0]!.proc!.pid;
    try {
      shards[0]!.proc!.kill(9);
    } catch {
      // Already exited.
    }
    await waitFor(() => {
      const cur = (sup as unknown as { shards: Map<number, { proc: WorkerProc | null }[]> }).shards.get(9);
      return !!cur?.[0]?.proc && cur[0].proc.pid !== firstPid;
    });
    const after = ticks.length;
    await waitFor(() => ticks.length > after);
    expect(ticks.some((t) => t.symbol === "BTC")).toBe(true);
    await sup.shutdown();
  });
});
