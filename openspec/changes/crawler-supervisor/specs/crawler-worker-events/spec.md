## Purpose

Propagates user-initiated crawler and mapping changes to the supervisor exactly once per successful write, so the subscription state can never diverge from the database.

## ADDED Requirements

### Requirement: Worker control endpoint publishes worker-changed

The system SHALL publish a `worker-changed` event carrying exchange identity and start/stop action whenever the worker control endpoint succeeds.

#### Scenario: Successful start publishes event

- **WHEN** a user starts an exchange via the control endpoint
- **THEN** one `worker-changed` event with action start is published

#### Scenario: Failed start publishes nothing

- **WHEN** a worker start request fails validation or the write fails
- **THEN** no `worker-changed` event is published

### Requirement: Mapping and chain routes publish coin-detail-changed

The system SHALL publish a `coin-detail-changed` event carrying the affected identity and changed flags after every successful coin-mapping or chain-mapping mutation (add, update, delete).

#### Scenario: Chain suspend emits event

- **WHEN** a user disables withdraw on an exchange coin chain
- **THEN** one `coin-detail-changed` event identifying that mapping and its new flags is published

#### Scenario: Coin delist emits event

- **WHEN** a user removes a coin mapping from an exchange
- **THEN** one `coin-detail-changed` event identifying the removed mapping is published

#### Scenario: Failed mutation emits nothing

- **WHEN** a mapping or chain mutation fails or targets a missing row
- **THEN** no `coin-detail-changed` event is published
