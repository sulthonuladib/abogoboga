# Crawler worker contract (owner-side exchange implementations)

Reference implementation: `src/core/crawler/tester-worker.ts` (aliased for
tests at `tests/fixtures/dummy-worker.ts`). Parent side:
`src/core/crawler/crawler.contract.ts` (plain TS types), `src/core/crawler/supervisor.ts`.
Seed data for it: `bun run db:seed:tester` (`src/seed/tester-exchanges.ts`).

## Channels (five)

- **argv — immutable bootstrap.** Spawned as
  `bun <worker> --crawler-worker <exchangeSlug> <shardId> <coins>` where
  `<coins>` is `SYM:cmcId,...` (empty = none). Parsed once at boot; args
  freeze for the process lifetime. Live changes arrive over stdin, never argv.
- **stdin — live commands (JSONL).** `{type:"subscribe",coins:[...]}` and
  `{type:"unsubscribe",coins:[...]}` with `coins=[{symbol,cmcId}]`. One JSON
  object per line. Workers apply incrementally; no restart on coin changes.
- **stdout — canonical ticks (JSONL).** One tick per line:
  `{exchangeSlug,symbol,cmcId,bids,asks,timestamp}` with
  `bids/asks=[price,qty][]` best-first in the exchange quote currency.
  No exchange-specific branching in the parent; normalize in the worker.
- **stderr — logs only.** Never emit ticks here; the parent drains it as text.
  Stdout/stderr are separate pipes so interleaved logs cannot corrupt parsing.
- **exit code — health.** `0` = clean (parent drops tracking like a stop);
  nonzero while desired = crash, parent respawns with backoff replaying the
  last-known coin set (argv bootstrap = last-known set).

## Argv indices (script form)

`Bun.argv[0]=bun`, `[1]=script`, then user args start at index 2:

- `argv[2]` = `--crawler-worker` (stable signature for boot sweep)
- `argv[3]` = exchange slug
- `argv[4]` = shard id
- `argv[5]` = `SYM:cmcId,...` bootstrap list

Index-2 is a known footgun (legacy `bitget.ts` used `argv[1]`); the dummy
worker asserts the marker and exits 2 on mismatch.

## EOF rule

Stdin EOF means the parent is gone. Workers MUST self-terminate promptly on
EOF (dummy: breaks the read loop, clears timers, `process.exit(0)`). Parent
side additionally sweeps `ps` entries containing `--crawler-worker` on boot,
starts nothing, and waits for explicit user starts; shutdown closes stdin
then SIGTERMs all shards.

## Secrets

Tokens travel via `Bun.spawn({ env })`, never argv (argv leaks through
process listings). The dummy worker takes no secrets; real workers read them
from `process.env`.

## Tick pipeline (parent, shared)

IDR conversion (`getUsdtToIdrRate`, single stub-constant call site), 2M IDR
volume walk per side best-first (`buyPrice` from asks, `sellPrice` from bids,
amounts = base qty), skip-on-thin-book (either side below target leaves the
snapshot untouched), per-tick upsert with no batching.
