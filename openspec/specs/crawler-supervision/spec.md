# crawler-supervision Specification

## Purpose

Defines supervisor behavior for the crawler: starting and stopping per-exchange worker sets, shard placement under per-connection subscription ceilings, status observation, and safety-net recovery when a worker dies.

## Requirements

### Requirement: Start an exchange worker set

The supervisor SHALL start a worker set for an exchange when asked, chunking the eligible coins into shards of at most the exchange's per-shard capacity, with one worker per shard.

#### Scenario: Coins are sharded at capacity
- **WHEN** an exchange with capacity 20 is started with 45 eligible coins
- **THEN** the supervisor creates three shards holding 20, 20, and 5 coins in placement order

#### Scenario: Starting a running exchange conflicts
- **WHEN** an exchange is started while it already has a running worker set
- **THEN** the start fails with a conflict and the existing shards are untouched

### Requirement: Stop an exchange worker set

The supervisor SHALL terminate every shard's worker and cancel pending recovery when an exchange is stopped, and treat stopping an exchange that is not running as a successful no-op.

#### Scenario: Stop terminates all shards
- **WHEN** a running exchange with multiple shards is stopped
- **THEN** every shard's worker is closed and the exchange disappears from snapshots

#### Scenario: Stopping a non-running exchange is a no-op
- **WHEN** an exchange that is not running is stopped
- **THEN** the operation succeeds with no events published

### Requirement: Multiple workers per exchange

The supervisor SHALL run one worker per shard, so an exchange whose eligible coins exceed one connection's subscription ceiling runs multiple workers simultaneously, and a single-connection exchange runs exactly one shard.

#### Scenario: Coin placement fills spare capacity first
- **WHEN** coins are added to a running exchange
- **THEN** each coin is placed in the first shard with spare capacity, and a new shard is spawned only when every shard is full

#### Scenario: Empty shards terminate on removal
- **WHEN** removing coins empties a shard
- **THEN** that shard's worker is terminated while other shards keep running

### Requirement: Safety-net recovery from worker death

If a shard's worker dies despite worker-side self-healing, the supervisor SHALL re-establish the tick and status streams on a fresh worker with capped exponential backoff, bootstrapping it with the shard's current coin set.

#### Scenario: Streams resume after a worker defect
- **WHEN** a shard's worker dies of a defect
- **THEN** the supervisor backs off and re-acquires the streams on a fresh worker so ticks resume for the same coin set

#### Scenario: Stopping during recovery cancels it
- **WHEN** an exchange is stopped while a shard recovery is pending
- **THEN** the pending recovery is cancelled and no further worker is started for that shard

### Requirement: Status observation and events

The supervisor SHALL reflect each shard's worker-reported state in its snapshots and SHALL publish domain events for lifecycle transitions, including reconnect-state changes.

#### Scenario: Reconnect state is observable
- **WHEN** a shard's worker reports a reconnecting status
- **THEN** the shard's snapshot shows the reconnecting phase and a lifecycle event is published

#### Scenario: Snapshot exposes phase instead of process id
- **WHEN** an exchange snapshot is read
- **THEN** each shard reports its coins, phase, and restart count, without any operating-system process id

### Requirement: Tick ingestion and shard freshness

The supervisor SHALL forward each canonical worker tick to the configured control-plane ingestion handler with its exchange and shard identity, and SHALL record the local receipt time as `lastTickAt` for that shard. The Workers page SHALL show the latest tick receipt time or an explicit no-tick state.

#### Scenario: A worker tick is ingested and updates freshness
- **WHEN** a shard emits a canonical tick
- **THEN** the control-plane ingestion handler receives it and the shard snapshot reports its receipt time in `lastTickAt` as epoch milliseconds

#### Scenario: Freshness resumes after reconnect
- **WHEN** a shard reports reconnecting and later emits another tick
- **THEN** `lastTickAt` advances and the Workers page shows the shard running with the newer tick receipt time

#### Scenario: A shard has not emitted a tick
- **WHEN** a shard has started but has not produced a tick
- **THEN** its snapshot reports `lastTickAt` as null and the Workers page indicates that no tick has arrived

### Requirement: No orphaned workers

The system SHALL NOT leave orphaned worker threads behind: when the control plane stops, every worker dies with it, and no separate cleanup step is required at startup.

#### Scenario: Control-plane shutdown leaves nothing behind
- **WHEN** the control-plane process terminates
- **THEN** no worker threads continue running and no stale-worker sweep is needed on restart
