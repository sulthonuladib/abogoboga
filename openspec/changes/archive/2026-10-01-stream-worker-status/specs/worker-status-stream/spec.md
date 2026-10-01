# Spec Delta

## Purpose

Delivers live worker status to monitoring clients over the event socket, so the Workers page reflects server-driven transitions as they happen instead of only at load time.

## ADDED Requirements

### Requirement: Workers topic
The event socket SHALL accept `workers` as a topic in subscribe and unsubscribe frames and SHALL deliver worker status events on that topic. A worker status event SHALL carry the full current status of every exchange worker known to the control plane. A frame naming a topic outside the supported set SHALL be ignored without closing the connection.

#### Scenario: Subscribe and unsubscribe
- **WHEN** a connected client sends a subscribe frame for the `workers` topic
- **THEN** the server begins delivering worker status events to that connection
- **AND** a later unsubscribe frame for the same topic stops further worker status events on that connection without affecting other topics or connections

#### Scenario: Unsupported topic ignored
- **WHEN** a client sends a frame naming a topic outside the supported set
- **THEN** the server ignores that frame and the connection stays open

### Requirement: Snapshot on subscribe
A client subscribing to the `workers` topic SHALL receive the current worker status without waiting for a lifecycle transition, so a newly opened page shows present state immediately. A received snapshot SHALL NOT be followed by an event carrying state older than that snapshot.

#### Scenario: First event is current state
- **WHEN** a client subscribes to the `workers` topic
- **THEN** the first worker status event it receives lists the current status of every known exchange worker

#### Scenario: No event older than the snapshot
- **WHEN** a status change is published between a client's subscribe frame and the snapshot the server reads for that client
- **THEN** the client receives the snapshot, and does not subsequently receive an event whose state is older than the snapshot

### Requirement: Event-driven refresh while subscribed
While at least one client is subscribed to the `workers` topic, the server SHALL publish a fresh full worker status snapshot after each worker lifecycle transition, so subscribed clients observe transitions they did not initiate.

#### Scenario: Transition reaches subscribed clients
- **WHEN** a worker lifecycle transition occurs while a client is subscribed to the `workers` topic
- **THEN** that client receives a new worker status event reflecting the transition, without issuing a request

#### Scenario: No work without subscribers
- **WHEN** a worker lifecycle transition occurs while no client is subscribed to the `workers` topic
- **THEN** the server produces no worker status event and retains nothing for a later subscriber

### Requirement: Status stays current while subscribed
While a client is subscribed to the `workers` topic, a change to any status the page renders SHALL publish a worker lifecycle event and reach that client, so a rendered field such as a shard's phase never stays stale and the server needs no refresh timer.

#### Scenario: Phase change after reconnect
- **WHEN** a shard's phase changes to `running` after a reconnect while a client is subscribed to the `workers` topic
- **THEN** the server publishes a `running` worker lifecycle event
- **AND** that client receives a worker status event showing the new phase without issuing a request and without a reload

### Requirement: Workers page reflects pushed status
While the Workers route is open and the event socket is connected, the Workers page SHALL apply every received worker status event to its rows without a reload. Leaving the route SHALL stop the subscription, and reconnecting SHALL re-subscribe and re-apply the current snapshot.

#### Scenario: Live update without reload
- **WHEN** the Workers page is open and a worker status event arrives
- **THEN** the page displays the event's statuses without the viewer reloading or refetching

#### Scenario: Recovery after a failed load
- **WHEN** the Workers page has failed to load its rows and a worker status event then arrives
- **THEN** the page displays the event's statuses instead of the failure

#### Scenario: Leave and return
- **WHEN** the viewer leaves the Workers route
- **THEN** the client stops requesting worker status events
- **AND** returning to the route re-subscribes and applies the then-current snapshot
