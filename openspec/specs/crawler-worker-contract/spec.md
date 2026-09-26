# crawler-worker-contract Specification

## Purpose

Defines the RPC contract between the crawler supervisor and per-shard exchange workers: bootstrap identity, subscription commands, tick and status streams, liveness, reconnect behavior, and clean shutdown.

## Requirements

### Requirement: Worker bootstrap identity

A worker SHALL receive its exchange slug, shard id, and bootstrap coins as an initial message at spawn time, and SHALL treat the bootstrap coins as its initial subscription set.

#### Scenario: Worker boots with bootstrap coins
- **WHEN** the supervisor spawns a worker with a bootstrap identity carrying N coins
- **THEN** the worker subscribes to those N coins and emits ticks for them without any further command

#### Scenario: Worker refuses invalid bootstrap identity
- **WHEN** a worker is spawned without a decodable bootstrap identity
- **THEN** the worker reports the failure to the parent and emits no ticks

### Requirement: Live subscription commands

A worker SHALL accept subscribe and unsubscribe commands over RPC for its lifetime, adding and removing coins from its subscription set.

#### Scenario: Subscribe adds coins
- **WHEN** the supervisor subscribes a running worker to coins not currently subscribed
- **THEN** the worker starts emitting ticks for those coins and the call succeeds

#### Scenario: Duplicate subscribe is idempotent
- **WHEN** the supervisor subscribes a worker to coins it already subscribes to
- **THEN** the call succeeds and tick emission is unchanged

#### Scenario: Unsubscribe stops tick emission
- **WHEN** the supervisor unsubscribes a running worker from subscribed coins
- **THEN** the worker stops emitting ticks for those coins and the call succeeds

#### Scenario: Unsubscribe of unknown coins succeeds
- **WHEN** the supervisor unsubscribes coins the worker does not subscribe to
- **THEN** the call succeeds with no change to tick emission

### Requirement: Continuous tick stream

A worker SHALL expose a continuous stream of canonical ticks for its subscription set, and interrupting or failing the stream SHALL NOT affect the worker's ability to serve other calls.

#### Scenario: Ticks flow for the subscription set
- **WHEN** a worker has an active subscription set
- **THEN** the parent receives canonical ticks for subscribed coins carrying exchange slug, symbol, coingecko id, bids, asks, and timestamp

#### Scenario: Tick stream interruption leaves commands available
- **WHEN** the parent stops consuming the tick stream
- **THEN** the worker still accepts and applies subscribe and unsubscribe commands

### Requirement: Self-healing reconnection

When a worker's connection to its exchange fails, the worker SHALL rebuild the connection and resubscribe its current subscription set, retrying every 1 second indefinitely, and the tick stream SHALL resume after a successful reconnect rather than failing.

#### Scenario: Reconnect after connection loss
- **WHEN** a worker's exchange connection drops while coins are subscribed
- **THEN** the worker retries connecting every 1 second and, once connected, resubscribes all currently-subscribed coins and resumes emitting ticks

#### Scenario: Subscription changes survive reconnects
- **WHEN** coins were subscribed or unsubscribed before a connection loss
- **THEN** after reconnect the worker's subscription set reflects those latest changes

### Requirement: Worker status reporting

A worker SHALL report its connection state to the parent: `starting` before ticks flow, `running` while the connection is healthy, and `reconnecting` between connection attempts, with reconnecting reports carrying the attempt count.

#### Scenario: State transitions are reported
- **WHEN** a worker starts, loses its connection, and later reconnects
- **THEN** the parent receives status updates in the order starting, running, reconnecting, running

#### Scenario: Reconnecting reports carry attempt count
- **WHEN** a worker reports a reconnecting status
- **THEN** the report includes the number of the reconnect attempt

### Requirement: Liveness probe

A worker SHALL answer a health probe with whether it considers itself running.

#### Scenario: Healthy worker answers health probe
- **WHEN** the parent probes a running worker's health
- **THEN** the worker reports it is running

### Requirement: Clean shutdown

When the parent closes a worker, the worker SHALL release its exchange resources before terminating, and the parent SHALL forcibly terminate a worker that does not close within a bounded timeout.

#### Scenario: Graceful close releases resources
- **WHEN** the parent asks a worker to shut down
- **THEN** the worker closes its exchange connection and acknowledges termination

#### Scenario: Hung worker is forcibly terminated
- **WHEN** a worker does not acknowledge shutdown within the timeout
- **THEN** the parent forcibly terminates the worker thread

### Requirement: Reboot after worker death

When a worker thread dies, the transport SHALL respawn it after a fixed 1-second delay and SHALL resend the same bootstrap identity, so tick delivery resumes on a fresh worker.

#### Scenario: Dead worker is respawned with the same identity
- **WHEN** a worker dies and is respawned
- **THEN** the fresh worker receives the same exchange slug, shard id, and bootstrap coins as the original
