## Purpose

Manages exchange crawler subprocess lifecycle so that user start/stop actions reliably translate into running, correctly-sized workers with no orphans and no silent gaps.

## ADDED Requirements

### Requirement: Start exchange worker via RPC

The system SHALL expose a worker control endpoint that starts crawling for an exchange, spawning one subprocess per shard of up to 20 coins covering the eligible coin set.

#### Scenario: Start exchange with fewer coins than one shard

- **WHEN** a user starts a stopped exchange whose eligible set has 19 coins
- **THEN** exactly one subprocess is spawned holding all 19 coins

#### Scenario: Start exchange exceeding shard capacity

- **WHEN** a user starts a stopped exchange whose eligible set has 45 coins
- **THEN** three subprocesses are spawned and no subprocess holds more than 20 coins

#### Scenario: Start already-running exchange

- **WHEN** a user starts an exchange that is already running
- **THEN** the request is rejected with a conflict error, no event is published, and no duplicate subprocess is spawned

### Requirement: Stop exchange worker via RPC

The system SHALL terminate all subprocesses of an exchange on stop and SHALL NOT respawn them until a later start.

#### Scenario: Stop running exchange

- **WHEN** a user stops a running exchange
- **THEN** all its subprocesses are terminated and its coins are removed from the desired set

#### Scenario: Stop already-stopped exchange

- **WHEN** a user stops an exchange that is not running
- **THEN** the request is rejected with a conflict error and no event is published

### Requirement: Crash recovery with replay

The system SHALL respawn a subprocess that exits unexpectedly while still desired, restoring its last-known coin set, with backoff to avoid crash loops.

#### Scenario: Worker crashes while desired

- **WHEN** a shard exits with a nonzero code and its exchange is still running
- **THEN** a replacement subprocess is spawned with the same coin set

#### Scenario: Worker exits after stop

- **WHEN** a shard exits and its exchange is stopped
- **THEN** no replacement is spawned and the shard is dropped from tracking

### Requirement: Boot starts nothing and sweeps orphans

The system SHALL NOT auto-start any exchange on parent boot, and SHALL terminate stale worker processes from a previous parent generation before accepting starts.

#### Scenario: Parent reboot with orphans present

- **WHEN** the parent process boots while orphaned workers from a previous generation exist
- **THEN** the orphans are terminated and zero exchanges are running until the user starts them
