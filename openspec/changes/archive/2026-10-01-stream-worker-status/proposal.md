# Proposal

## Why

The Workers page loads its rows once and only refreshes after the viewer's own start or stop. Every server-driven change — the gate opening, a shard moving between `starting`, `running`, and `reconnecting`, restarts climbing, `subscribedCoins` changing, or a transition another viewer made — stays invisible until the page is reloaded. The event socket already streams the Signals page continuously; worker state should travel the same channel instead of going stale.

## What Changes

- Add a `workers` topic to the event-socket contract, so `SubscribeFrame`/`UnsubscribeFrame` accept it and `ServerEvent` carries its payload.
- Add a `WorkersProjector` beside `SignalProjector`: its snapshot is the current `WorkerControl.statuses`, and it publishes a fresh full snapshot after each worker lifecycle event, only while the topic has at least one subscriber.
- Publish a `running` worker lifecycle event in the crawler when a shard's phase reaches `running`, so every status the page renders is event-backed and the projector's republish is complete without a periodic poll.
- Wire the projector and its loop into the API composition root alongside the signal projector.
- Subscribe the Folding Plane's Workers route to the topic and fold each pushed snapshot into the page model. The existing post-action refetch stays as the fallback for a viewer whose socket is not connected.
- Reuse the existing `WorkerControl.statuses` and `WorkerControl.events`; no new persistence or polling is introduced.

## Capabilities

### New Capabilities

- `worker-status-stream`: the `workers` topic on the event socket — its delivery semantics (initial snapshot on subscribe, event-driven republish while subscribed, nothing buffered when unsubscribed) — and the Workers page reflecting pushed status without a reload.

### Modified Capabilities

None.

## Impact

- **`packages/api`**: `EventChannel.ts` (topic list, `ServerEvent` union, an `isWorkersEvent` guard, a `seq` on `WorkersEvent`, an eager `subscribeScoped` on the channel, the `WorkersProjector` service) plus its public exports.
- **`packages/crawler`**: `Supervisor.ts` publishes a `running` event when a shard's phase reaches `running`; `WorkerEventTypes.ts` adds the `running` kind to the lifecycle vocabulary.
- **`apps/control-plane-api`**: `Main.ts` (projector layer and scoped loop), `EventSocket.ts` (`topicStream` gains the `workers` case).
- **`apps/folding-plane`**: `realtime.ts` (workers frame stream and route-gated subscription), `message.ts` (`ReceivedWorkers`), `update.ts` (route gating and fold into the Workers child), `page/workers/update.ts` (a `receivedWorkers` step; the start/stop `refresh` stays as the disconnected fallback).
- **Tests**: `packages/api/src/EventChannel.test.ts` for the projector, and the Folding Plane realtime/worker tests for the subscription and fold.
- **Behavior**: worker rows update live while the Workers route is open; no existing HTTP endpoint or payload changes.
