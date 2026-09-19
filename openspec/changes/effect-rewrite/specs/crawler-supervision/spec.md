# Spec Delta

## Purpose

Crawler supervision keeps one sharded worker subprocess per running exchange, converges subscriptions to database truth, and persists executable orderbook snapshots from worker ticks.

## ADDED Requirements

### Requirement: Sharded supervision with backoff respawn

Each running exchange SHALL be covered by shards of at most the configured capacity. A crashed shard SHALL be respawned with capped exponential backoff replaying its last-known coin set; a clean exit of a still-desired shard SHALL drop tracking; stopping an exchange SHALL terminate all its shards and cancel pending respawns.

#### Scenario: Crash recovery

- **WHEN** a shard process exits non-zero while its exchange is still running
- **THEN** the shard is respawned after a backoff delay with the same coin set and the restart count increments

### Requirement: Reconciliation to database truth

Subscription state SHALL be recomputed from the database on every worker-changed and coin-detail-changed event, never trusted from event payloads. Exchanges not marked running SHALL be ignored.

#### Scenario: Mapping change converges

- **WHEN** a market assignment is removed for a running exchange
- **THEN** the affected coin is unsubscribed (or its emptied shard terminated) without touching other shards

### Requirement: Tick ingestion into snapshots

Ticks SHALL be converted to executable quotes (buy lifts asks, sell hits bids against the fixed IDR volume target with the single USDT/IDR rate source) and upserted per market mapping; thin books SHALL leave the stored snapshot untouched.

#### Scenario: Thin book skipped

- **WHEN** a tick arrives whose side totals below the volume target
- **THEN** no snapshot row is written and processing continues with the next tick

### Requirement: Stale-worker sweep on boot

On startup the supervisor SHALL terminate orphaned worker processes from a previous generation (matched by argv signature) and start with nothing running, waiting for explicit starts.

#### Scenario: Clean boot

- **WHEN** the process boots while stale worker processes exist
- **THEN** the stale processes are terminated and no exchange is running until explicitly started
