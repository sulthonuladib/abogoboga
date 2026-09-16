## Purpose

Turns canonical per-tick orderbook data into IDR-normalized executable prices at a fixed 2M IDR volume depth, persisted as per-exchange snapshots for arbitrage comparison.

## ADDED Requirements

### Requirement: Canonical tick intake

The system SHALL accept ticks in the canonical post-normalization form of coin identity plus bids, asks, and timestamp, independent of exchange wire format.

#### Scenario: Tick arrives in canonical form

- **WHEN** a worker emits a canonical tick for a subscribed coin
- **THEN** the pipeline processes it without exchange-specific branching

### Requirement: IDR conversion before volume walk

The system SHALL convert all book prices to IDR before walking volume, using a single rate source for every exchange.

#### Scenario: USDT-quoted book processed

- **WHEN** a tick arrives from a USDT-quoted exchange
- **THEN** the resulting snapshot prices are in IDR converted at the current single rate

### Requirement: Two-million IDR volume walk

The system SHALL walk each side of the book from the best price, accumulating price times quantity until cumulative value reaches 2,000,000 IDR, and record the execution price, executed amount, and cumulative value for both sides as buyPrice, sellPrice, buyAmount, and sellAmount.

#### Scenario: Book deeper than target on both sides

- **WHEN** a tick has at least 2,000,000 IDR of depth on bids and asks
- **THEN** the snapshot records full-target execution on both sides

#### Scenario: Thin book below target

- **WHEN** a side of the book totals less than 2,000,000 IDR
- **THEN** the snapshot is left untouched for that tick (NOTE: partial-fill handling deferred to a future change)

### Requirement: Per-tick upsert of orderbook snapshot

The system SHALL upsert the orderbook snapshot for each (exchange, coin) on every processed tick with no batching or flush interval.

#### Scenario: Successive ticks for same coin

- **WHEN** two ticks for the same exchange coin are processed in order
- **THEN** the stored snapshot reflects the later tick
