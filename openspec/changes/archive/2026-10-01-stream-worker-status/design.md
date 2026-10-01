# Design

## Context

See `proposal.md` — Why. The relevant current state:

- The event socket is a generic hub. `packages/api/src/EventChannel.ts` owns `topics`, `ClientFrame`, and an `EventChannel` service that fans a `ServerEvent` out per topic. `ServerEvent` currently lives in `Signal.ts` as `Union([SignalEvent])`. `apps/control-plane-api/src/EventSocket.ts` maps a subscribed topic to a projector stream with `Match.exhaustive`.
- `SignalProjector` (`EventChannel.ts`) is the template: `snapshot` reads the store, `start` is a shared loop that publishes every second while `count(topic) > 0`, and `subscribe` emits the current snapshot followed by the live stream.
- `WorkerControl` (`packages/api/src/WorkerControl.ts`) already exposes exactly what the page renders: `statuses` (`WorkerStatus[]`) and `events` (a replaying lifecycle stream). `WorkerControl.events` is already consumed by the SSE endpoint `GET /api/workers/events`, which the browser never calls.
- `SignalProjector` is provided through the `eventServices` layer in `apps/control-plane-api/src/Main.ts`, not through the application dependency layer. `WorkerControl` is provided by `workerControlProvided`, which builds the stateful crawler layers.
- The Folding Plane wires signals through one route-gated subscription (`realtime.ts`), one decoded message stream that emits a root fact (`ReceivedSignalRows`), and a child step (`Signals.receivedSignal`). The Workers page has none of that: it loads on `init`/`entered` and refetches only after its own start/stop.

## Goals / Non-Goals

**Goals:**

- Push the full worker status snapshot to subscribed clients over the existing event socket, driven by worker lifecycle transitions rather than a fixed poll.
- Keep exactly one `EventChannel`, one `WorkerControl`, and one crawler `Supervisor`; do not spawn a second set of stateful layers for the workers projector.
- Mirror the signal plumbing on the client so the two topics read the same way.
- Stay backward compatible: the socket protocol change is additive.

**Non-Goals:**

- No change to `GET /api/workers`, `POST /api/workers/:id/start`, `POST /api/workers/:id/stop`, or their payloads.
- No retirement of the existing `GET /api/workers/events` SSE endpoint (see Open Questions).
- No history or replay on the `workers` topic beyond the live snapshot; a subscriber never receives transitions it missed while unsubscribed.
- No change to the `signal` topic's tick behavior or payload.

## Decisions

### Full snapshots, delivered on the socket

The `workers` event carries `WorkerStatus[]`, the same shape the page already renders, rather than forwarding a lifecycle `WorkerEvent` the client would have to fetch against. Alternatives: forward `WorkerEvent` and have the page call `listWorkers` per transition (extra round trip per event, more load, two sources of truth), or point the browser at the existing SSE stream (a second transport, and it does not fit the route-gated subscription the socket already models). Snapshot delivery lets the page apply one event with no request, matching `signal`.

### Event-driven republish, no refresh tick

`WorkersProjector.start` consumes `WorkerControl.events` and publishes a fresh snapshot per lifecycle event while `count("workers") > 0`. The earlier design also republished every `workersRefreshInterval` (two seconds) because the supervisor emitted no event when a shard reached `running`: it published `reconnecting` on the way down, but when the shard recovered it updated its in-memory phase and emitted nothing. A purely event-driven projector therefore left the rendered phase stale at `reconnecting`.

The refresh tick is retired. The crawler now publishes a `running` worker lifecycle event when a shard's phase reaches `running`, so every status the page renders is accompanied by an event: `started`/`stopped`/`paused` for desired and running state, `shard-spawned` for a shard and its restart count, `running` and `reconnecting` for phase, and `reconciled` for `subscribedCoins`. With full coverage there is nothing left for a timer to reconcile, and the directory query each republish issues now runs only on transitions instead of every two seconds. Adding `running` to the lifecycle vocabulary keeps the projector event-driven; the `workers` snapshot payload only gains the additive `seq` field described below.

The `events` stream replays recent history on subscription. The loop publishes only when `count > 0`, so startup replay with no subscriber produces nothing, and a subscriber only sees snapshots for transitions after it attaches.

### Sequence numbers close the snapshot/subscribe race

`subscribe` must attach to the live topic before it reads the snapshot, or a transition published in between is lost; attaching first and then emitting the snapshot risks forwarding a buffered event that is older than the snapshot just handed to the subscriber. `WorkersEvent` carries a `seq`, a per-process counter the projector increments as it publishes, and the projector takes a semaphore for both publishing and reading a subscription snapshot. A snapshot read therefore reports a sequence and a state that are consistent: a buffered event at or below that sequence is stale and is dropped, and one above it is newer and is forwarded. The subscriber sees the snapshot, then only strictly newer events — no gap and no regression. `EventChannel` exposes `subscribeScoped`, an eager attachment whose count bump lives for the subscriber's scope, so the attach-before-snapshot order is expressible without a separate stream wrapper.

### Move `ServerEvent` into `EventChannel.ts`

The union is a property of the socket, not of signals. Co-locating `ServerEvent` with `topics` lets the union include a `workers` member whose schema (`WorkersEvent`) sits beside the topic list and imports `WorkerStatus` from `WorkerControl.ts`. `Signal.ts` keeps `SignalEvent`. `EventSocket.ts` and the browser already import `ServerEvent` through the package barrel, so no call-site changes.

### Dispatch and wiring

`EventSocket.ts` gains a `workers` arm in its topic match and requires `WorkersProjector` alongside `SignalProjector`. A topic-to-projector registry was considered and rejected: with two topics, an explicit match is clearer and stays exhaustive.

`Main.ts` adds `workersProjectorProvided` (built over `eventChannelLayer` and the existing `workerControlProvided`) and `workersProjectorLoop` to `eventServices`. Effect memoizes a layer built more than once within one build by reference, and `workerControlProvided`/`crawlerBase` are already referenced from several sublayers of `dependenciesLayer`, so the crawler is built once. If a second supervisor ever appears, the mitigation is to move the workers projector and its loop into the same dependency layer that builds `WorkerControl`, so no cross-layer reference is needed.

### Client mirrors the signal route

- `realtime.ts` adds a `workersFrameStream` (subscribe/unsubscribe frames via the existing `holdOpen`) and a `workersTopic` subscription entry gated on `route._tag === 'Workers' && isConnected`, keyed on `socketGeneration` so a reconnect re-subscribes.
- The single `eventMessageStream` decodes `ServerEvent` and now emits `ReceivedWorkers` for the workers variant (and `ReceivedSignalRows` for the signal variant as today).
- The root declares `ReceivedWorkers`, folds it through a `foldWorkersReceived` step that calls a new `Workers.receivedWorkers(rows)` step, which settles the page rows to success. This makes a pushed snapshot recover a page that previously failed to load.
- The start/stop `refresh` stays: it keeps the viewer's own action visible when the socket is down, and the pushed snapshot is idempotent with it.

## Risks / Trade-offs

- **Duplicate crawler/supervisor layers** → Effect memoizes `workerControlProvided` by reference within one build, as it already does for `supervisorProvided`; if that fails in practice, move the projector wiring into `dependenciesLayer` (single EventChannel, single WorkerControl).
- **Snapshot/subscribe race** — an event between reading the snapshot and attaching to the channel can be missed → closed by attaching before the snapshot and ordering the two with the `seq` field and a publish/snapshot semaphore, so a stale buffered event is dropped and only newer events are forwarded.
- **Event coverage** — a status change not accompanied by a lifecycle event would not reach clients on its own → the crawler publishes a `running` event when a shard's phase reaches `running` (the one gap the refresh tick covered), so every rendered field is event-backed and the tick is retired.
- **Background folds** — a workers event that arrives while another route is open still folds into the Workers child model → harmless, and the server only sends it while the route's subscription is active.
- **Additive protocol only** — a client that does not know the `workers` type decodes the frame as `None` and ignores it, so server can deploy before client and rollback is a revert.

## Migration Plan

1. Land the API contract and projector (`packages/api`), then the API wiring. The topic is dormant until a client subscribes.
2. Land the client subscription and fold.
3. Rollback is a revert of the client first, then the server; no persisted state changes.

## Open Questions

- Whether to retire `GET /api/workers/events` now that the socket carries worker state. It stays for this change; retiring it is a separate, breaking-API decision.
