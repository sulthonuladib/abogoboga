# Spec Delta

## Purpose

The worker control plane is where operators see which exchange workers are running and turn them on or off: an activator/deactivator with live monitoring, for example showing indodax started and binance started.

## ADDED Requirements

### Requirement: Worker activation and deactivation

The system SHALL expose start and stop operations per exchange. Starting an already-running worker and stopping a stopped worker SHALL be rejected as conflicts, and a rejected request SHALL emit no event and change no state. Starting an unknown exchange SHALL return 404.

#### Scenario: Duplicate start rejected

- **WHEN** an operator starts an exchange whose worker is already running
- **THEN** the request fails with a conflict error and no duplicate worker process is spawned

### Requirement: Live worker status

The system SHALL expose per-exchange status showing desired state (started/stopped), actual running state, shard sizes, restart counts, and eligible-coin counts, suitable for polling by the monitoring page.

#### Scenario: Status reflects reality

- **WHEN** an operator views worker status after starting an exchange with 45 eligible coins
- **THEN** the exchange shows started and running with shards sized within capacity and restart counts visible

### Requirement: Live event stream

The system SHALL expose a server-sent event stream of worker lifecycle events (started, stopped, shard spawned, shard exited, respawn scheduled, reconciled) that replays recent history to late subscribers.

#### Scenario: Reconnect catches up

- **WHEN** a monitoring client connects after several worker events occurred
- **THEN** it first receives the recent buffered events in order, then continues with live events
