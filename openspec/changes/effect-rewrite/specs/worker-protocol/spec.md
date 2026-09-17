# Spec Delta

## Purpose

The worker protocol is the wire contract between the supervisor and every per-exchange worker subprocess, so each exchange can be implemented independently while subscribe/unsubscribe behavior stays uniform.

## ADDED Requirements

### Requirement: Argv bootstrap

Workers SHALL be launched as `bun <script> --crawler-worker <exchangeSlug> <shardId> <coins>` where `<coins>` is a comma-separated `SYMBOL:cmcId` list (empty means no coins). Invalid bootstrap arguments SHALL cause the worker to exit non-zero with the reason on stderr.

#### Scenario: Boot with coins

- **WHEN** a worker launches with `--crawler-worker binance shard-1 BTC:1,ETH:1027`
- **THEN** it subscribes to exactly those two coins and begins emitting ticks

### Requirement: Stdin commands

The parent SHALL send newline-delimited JSON `subscribe`/`unsubscribe` commands carrying non-empty coin lists; malformed lines SHALL be logged and ignored without affecting other subscriptions.

#### Scenario: Live subscribe

- **WHEN** a running worker receives `{"type":"subscribe","coins":[{"symbol":"SOL","cmcId":5426}]}`
- **THEN** SOL ticks start appearing on stdout while existing subscriptions continue

### Requirement: Stdout ticks and stderr logs

Workers SHALL emit newline-delimited JSON ticks with `exchangeSlug`, `symbol`, `cmcId`, integer `bids`/`asks` price-level pairs, and integer `timestamp` on stdout, and logs only on stderr. Malformed stdout lines SHALL be skipped by the parent. Closing stdin (parent gone) SHALL make the worker self-terminate.

#### Scenario: Channel separation

- **WHEN** a worker logs verbosely while emitting ticks
- **THEN** every tick still parses and no log line is ever interpreted as a tick
