## Purpose

Keeps every running shard subscribed to exactly the transferable coin set, so suspensions, delistings, and additions take effect without restarts and signals never cover untransferable coins.

## ADDED Requirements

### Requirement: Strict stream gate per chain per exchange per cryptocurrency

The system SHALL keep a coin subscribed on an exchange only while it is listed AND trade-enabled AND has at least one chain with deposit and withdraw both enabled.

#### Scenario: Network suspension removes last enabled chain

- **WHEN** the final enabled chain of a coin on an exchange is suspended
- **THEN** the holding shard unsubscribes that coin

#### Scenario: Delist via mapping removal

- **WHEN** a user removes a coin mapping from an exchange
- **THEN** the holding shard unsubscribes that coin

#### Scenario: Listed flag toggled off

- **WHEN** a user sets listed to false for an exchange coin
- **THEN** the holding shard unsubscribes that coin

### Requirement: First-fit placement on coin add

The system SHALL place a newly eligible coin into an existing shard of that exchange with free capacity, spawning a new shard only when all shards are full.

#### Scenario: Space available in existing shard

- **WHEN** a coin becomes eligible on an exchange with shards at 20/20 and 19/20
- **THEN** the coin is subscribed via the 19/20 shard with no new process spawned

#### Scenario: All shards full

- **WHEN** a coin becomes eligible on an exchange with all shards at 20/20
- **THEN** a new subprocess is spawned holding that coin

### Requirement: Shard shrink on empty

The system SHALL terminate a shard whose subscription set becomes empty through unsubscribes.

#### Scenario: Last coin delisted from shard

- **WHEN** the final coin of a shard is unsubscribed
- **THEN** that subprocess is terminated and removed from tracking

### Requirement: Eligibility recomputed from database on every event

The system SHALL recompute eligibility from the database when handling subscription events and SHALL NOT trust subscription state carried in event payloads.

#### Scenario: Event arrives with stale payload

- **WHEN** a coin-detail event is handled after a newer overlapping change
- **THEN** the resulting subscription matches current database state, not the event payload
