import {
  WORKER_ARGV_MARKER,
  formatBootstrapCoins,
  parseCanonicalTick,
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerCommand,
} from "./crawler.contract";

export const SHARD_CAPACITY = 20;

export type WorkerProc = {
  pid: number;
  stdin: {
    write: (chunk: string | Uint8Array) => number;
    flush: () => void;
    close: () => void;
  } | null;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill: (sig?: number | NodeJS.Signals) => void;
};

export type Spawner = (
  args: string[],
  opts?: { env?: Record<string, string> },
) => WorkerProc;

export function buildWorkerArgv(
  workerScript: string,
  exchangeSlug: string,
  shardId: string,
  coins: BootstrapCoin[],
): string[] {
  return [
    "bun",
    workerScript,
    WORKER_ARGV_MARKER,
    exchangeSlug,
    shardId,
    formatBootstrapCoins(coins),
  ];
}

export function writeCommand(proc: WorkerProc, cmd: WorkerCommand): void {
  if (!proc.stdin) throw new Error("worker stdin is not piped");
  proc.stdin.write(`${JSON.stringify(cmd)}\n`);
  proc.stdin.flush();
}

function defaultSpawner(
  args: string[],
  opts?: { env?: Record<string, string> },
): WorkerProc {
  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...opts?.env },
  }) as unknown as WorkerProc;
  return proc;
}

export type StdioHandlers = {
  onTick: (tick: CanonicalTick) => void | Promise<void>;
  onLog?: (line: string) => void;
};

// Separate channels: stdout carries JSONL ticks, stderr carries logs.
// A reader is attached to each pipe independently so interleaved logs can
// never corrupt tick parsing.
export function attachStdio(proc: WorkerProc, handlers: StdioHandlers): () => void {
  let stopped = false;
  const decoder = new TextDecoder();

  void (async () => {
    if (!proc.stdout) return;
    const reader = proc.stdout.getReader();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (stopped) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const tick = parseCanonicalTick(line);
          if (tick) await handlers.onTick(tick);
        }
      }
    } catch {
      // Stream closed during shutdown.
    } finally {
      reader.releaseLock();
    }
  })();

  void (async () => {
    if (!proc.stderr) return;
    const reader = proc.stderr.getReader();
    let buf = "";
    const errDecoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (stopped) break;
        buf += errDecoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.trim()) handlers.onLog?.(line);
        }
      }
      if (buf.trim()) handlers.onLog?.(buf);
    } catch {
      // Stream closed during shutdown.
    } finally {
      reader.releaseLock();
    }
  })();

  return () => {
    stopped = true;
  };
}

export function coinKey(coin: Pick<BootstrapCoin, "symbol" | "cmcId">): string {
  return `${coin.symbol}:${coin.cmcId}`;
}

// Pure placement helper: chunk an ordered coin list into shards of capacity.
export function shardCoins(coins: BootstrapCoin[], capacity = SHARD_CAPACITY): BootstrapCoin[][] {
  const out: BootstrapCoin[][] = [];
  for (let i = 0; i < coins.length; i += capacity) out.push(coins.slice(i, i + capacity));
  return out;
}

export type ShardState = {
  shardId: string;
  exchangeSlug: string;
  coins: Map<string, BootstrapCoin>;
  proc: WorkerProc | null;
  detachStdio: (() => void) | null;
  restarts: number;
  stopped: boolean;
  respawnTimer: ReturnType<typeof setTimeout> | null;
};

export type SupervisorOptions = {
  workerScript: string;
  capacity?: number;
  spawner?: Spawner;
  onTick?: (tick: CanonicalTick) => void | Promise<void>;
  onLog?: (line: string) => void;
  respawnDelayMs?: (attempt: number) => number;
};

const defaultRespawnDelayMs = (attempt: number): number =>
  Math.min(5000, 100 * 2 ** attempt);

export class Supervisor {
  private shards = new Map<number, ShardState[]>();
  private slugs = new Map<number, string>();
  private shardSeq = new Map<number, number>();
  readonly workerScript: string;
  readonly capacity: number;
  private readonly spawner: Spawner;
  private readonly onTick: (tick: CanonicalTick) => void | Promise<void>;
  private readonly onLog: (line: string) => void;
  private readonly respawnDelayMs: (attempt: number) => number;

  constructor(opts: SupervisorOptions) {
    this.workerScript = opts.workerScript;
    this.capacity = opts.capacity ?? SHARD_CAPACITY;
    this.spawner = opts.spawner ?? defaultSpawner;
    this.onTick = opts.onTick ?? (() => {});
    this.onLog = opts.onLog ?? (() => {});
    this.respawnDelayMs = opts.respawnDelayMs ?? defaultRespawnDelayMs;
  }

  isRunning(exchangeId: number): boolean {
    return this.shards.has(exchangeId);
  }

  runningCount(): number {
    return this.shards.size;
  }

  shardSizes(exchangeId: number): number[] {
    return (this.shards.get(exchangeId) ?? []).map((s) => s.coins.size);
  }

  shardCoins(exchangeId: number): BootstrapCoin[][] {
    return (this.shards.get(exchangeId) ?? []).map((s) => [...s.coins.values()]);
  }

  private nextShardId(exchangeId: number): string {
    const n = (this.shardSeq.get(exchangeId) ?? 0) + 1;
    this.shardSeq.set(exchangeId, n);
    return `shard-${n}`;
  }

  private spawnShardState(
    exchangeId: number,
    exchangeSlug: string,
    shardId: string,
    coins: BootstrapCoin[],
  ): ShardState {
    const state: ShardState = {
      shardId,
      exchangeSlug,
      coins: new Map(coins.map((c) => [coinKey(c), c])),
      proc: null,
      detachStdio: null,
      restarts: 0,
      stopped: false,
      respawnTimer: null,
    };
    this.launch(state, exchangeId);
    return state;
  }

  private launch(state: ShardState, exchangeId: number): void {
    const coins = [...state.coins.values()];
    const proc = this.spawner(
      buildWorkerArgv(this.workerScript, state.exchangeSlug, state.shardId, coins),
    );
    state.proc = proc;
    state.detachStdio = attachStdio(proc, {
      onTick: (tick) => this.onTick(tick),
      onLog: (line) => this.onLog(line),
    });
    void proc.exited.then((code) => this.handleExit(exchangeId, state, code));
  }

  private handleExit(exchangeId: number, state: ShardState, code: number): void {
    state.detachStdio?.();
    state.detachStdio = null;
    state.proc = null;
    if (state.stopped) return;
    const list = this.shards.get(exchangeId);
    if (!list || !list.includes(state)) return; // dropped after stop/shrink
    if (code === 0) {
      // Clean exit while still desired is unexpected; drop tracking like a stop.
      this.shards.set(
        exchangeId,
        list.filter((s) => s !== state),
      );
      if ((this.shards.get(exchangeId) ?? []).length === 0) this.shards.delete(exchangeId);
      return;
    }
    // Crash while desired: respawn with backoff replaying the last-known set.
    const delay = this.respawnDelayMs(state.restarts);
    state.restarts += 1;
    state.respawnTimer = setTimeout(() => {
      state.respawnTimer = null;
      if (state.stopped) return;
      if (!(this.shards.get(exchangeId) ?? []).includes(state)) return;
      this.launch(state, exchangeId);
    }, delay);
  }

  async startExchange(
    exchangeId: number,
    exchangeSlug: string,
    coins: BootstrapCoin[],
  ): Promise<void> {
    if (this.isRunning(exchangeId)) return;
    this.slugs.set(exchangeId, exchangeSlug);
    const chunks = shardCoins(coins, this.capacity);
    if (chunks.length === 0) {
      this.shards.set(exchangeId, []);
      return;
    }
    const states = chunks.map(
      (chunk): ShardState =>
        this.spawnShardState(exchangeId, exchangeSlug, this.nextShardId(exchangeId), chunk),
    );
    this.shards.set(exchangeId, states);
  }

  async stopExchange(exchangeId: number): Promise<void> {
    const list = this.shards.get(exchangeId);
    if (!list) return;
    for (const state of list) {
      state.stopped = true;
      if (state.respawnTimer) clearTimeout(state.respawnTimer);
      state.respawnTimer = null;
      state.detachStdio?.();
      state.detachStdio = null;
      try {
        state.proc?.stdin?.close();
      } catch {
        // Already closed.
      }
      try {
        state.proc?.kill(15);
      } catch {
        // Already exited.
      }
      state.proc = null;
    }
    this.shards.delete(exchangeId);
  }

  // First-fit placement: fill the first shard with space, else spawn.
  async addCoins(exchangeId: number, coins: BootstrapCoin[]): Promise<void> {
    const list = this.shards.get(exchangeId);
    if (!list) return;
    const slug = this.slugs.get(exchangeId) ?? "unknown";
    for (const coin of coins) {
      const key = coinKey(coin);
      if (list.some((s) => s.coins.has(key))) continue;
      const target = list.find((s) => s.coins.size < this.capacity);
      if (target) {
        target.coins.set(key, coin);
        if (target.proc) {
          try {
            writeCommand(target.proc, { type: "subscribe", coins: [coin] });
          } catch {
            // Proc died between placement and write; respawn path replays.
          }
        }
      } else {
        list.push(this.spawnShardState(exchangeId, slug, this.nextShardId(exchangeId), [coin]));
      }
    }
  }

  // Targeted unsubscribe; a shard emptied by unsubscribes is terminated.
  async removeCoins(exchangeId: number, coins: BootstrapCoin[]): Promise<void> {
    const list = this.shards.get(exchangeId);
    if (!list) return;
    const keys = new Set(coins.map(coinKey));
    for (const state of [...list]) {
      let touched = false;
      for (const key of keys) {
        if (state.coins.delete(key)) touched = true;
      }
      if (!touched) continue;
      if (state.coins.size === 0) {
        state.stopped = true;
        if (state.respawnTimer) clearTimeout(state.respawnTimer);
        state.respawnTimer = null;
        state.detachStdio?.();
        state.detachStdio = null;
        try {
          state.proc?.stdin?.close();
        } catch {
          // Already closed.
        }
        try {
          state.proc?.kill(15);
        } catch {
          // Already exited.
        }
        state.proc = null;
        const idx = list.indexOf(state);
        if (idx >= 0) list.splice(idx, 1);
      } else if (state.proc) {
        try {
          writeCommand(state.proc, {
            type: "unsubscribe",
            coins: coins.filter((c) => keys.has(coinKey(c))),
          });
        } catch {
          // Proc died; respawn path replays the reduced set.
        }
      }
    }
    if (list.length === 0) this.shards.delete(exchangeId);
  }

  async shutdown(): Promise<void> {
    for (const exchangeId of [...this.shards.keys()]) {
      await this.stopExchange(exchangeId);
    }
  }
}

export type ProcessEntry = { pid: number; args: string };

// Boot sweep: terminate stale worker processes from a previous parent
// generation (matched by argv signature), then start nothing.
export async function sweepStaleWorkers(opts?: {
  list?: () => Promise<ProcessEntry[]>;
  kill?: (pid: number) => void;
  selfPid?: number;
}): Promise<number[]> {
  const selfPid = opts?.selfPid ?? process.pid;
  const list =
    opts?.list ??
    (async (): Promise<ProcessEntry[]> => {
      const out = Bun.spawnSync(["ps", "-eo", "pid,args"]);
      const text = out.stdout.toString();
      return text
        .split("\n")
        .slice(1)
        .flatMap((line): ProcessEntry[] => {
          const m = line.trim().match(/^(\d+)\s+(.*)$/);
          if (!m) return [];
          return [{ pid: Number(m[1]), args: m[2] ?? "" }];
        });
    });
  const kill =
    opts?.kill ??
    ((pid: number): void => {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    });
  const entries = await list();
  const killed: number[] = [];
  for (const entry of entries) {
    if (entry.pid === selfPid) continue;
    if (!entry.args.includes(WORKER_ARGV_MARKER)) continue;
    kill(entry.pid);
    killed.push(entry.pid);
  }
  return killed;
}

// Boot policy: sweep orphans, start nothing, wait for explicit user starts.
export async function bootSupervisor(
  supervisor: Supervisor,
  opts?: Parameters<typeof sweepStaleWorkers>[0],
): Promise<{ killed: number[]; running: number }> {
  const killed = await sweepStaleWorkers(opts);
  return { killed, running: supervisor.runningCount() };
}
