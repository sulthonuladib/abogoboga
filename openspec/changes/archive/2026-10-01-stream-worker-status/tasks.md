# Tasks

## 1. Event contract and projector

- [x] 1.1 In `packages/api/src/EventChannel.ts`, add `"workers"` to `topics`, define `WorkersEvent` (`type: "workers"`, `workers: Schema.Array(WorkerStatus)`), add an `isWorkersEvent` guard, and move the `ServerEvent` union into this module as `Union([SignalEvent, WorkersEvent])`; remove `ServerEvent` from `Signal.ts` and keep every importer resolving through the barrel. Verify `bunx tsc --noEmit` passes and `bun test packages/api/src/EventChannel.test.ts` still passes.
- [x] 1.2 Implement `WorkersProjector` (a `snapshot`, an event-driven `start`, and a `subscribe` that emits the current snapshot then the live stream) over `WorkerControl` and `EventChannel`, mirroring `SignalProjector`. Verify with new `EventChannel.test.ts` cases: no `statuses` read while `count("workers")` is zero, one snapshot published per lifecycle event while subscribed, the first event on subscribe is the current snapshot, and a transition while unsubscribed is not delivered to a later subscriber.
- [x] 1.3 In `packages/crawler`, add `running` to `workerEventTypeLiterals` and publish a `running` worker lifecycle event from the supervisor when a shard's `Status` reaches `running`, so every rendered status change is event-backed. In `packages/api/src/EventChannel.ts`, remove `workersRefreshInterval` and the tick from `WorkersProjector.start`, leaving the loop to republish only on lifecycle events. Verify with `Supervisor.test.ts` that a shard recovering from `reconnecting` publishes a `running` event, and with `EventChannel.test.ts` that the projector republishes nothing while subscribed with no lifecycle event.
- [x] 1.4 Add a `seq` field to `WorkersEvent`, take a semaphore in `WorkersProjector` around both publishing and reading a subscription snapshot, and add an eager `subscribeScoped` to `EventChannel`. `subscribe` attaches before reading the snapshot and drops buffered events at or below its sequence, so no event older than the snapshot is forwarded. Verify with `EventChannel.test.ts` that the topic stays subscribed for the stream's lifetime and that a stale live event is dropped while a newer one is forwarded.

## 2. API wiring

- [x] 2.1 In `apps/control-plane-api/src/EventSocket.ts`, add the `workers` arm to `topicStream` and require `WorkersProjector` in the handler. Verify `bunx tsc --noEmit` passes and extend `apps/control-plane-api/src/EventSocket.test.ts` so a client that subscribes to `workers` receives a worker status event.
- [x] 2.2 In `apps/control-plane-api/src/Main.ts`, add `workersProjectorProvided` and `workersProjectorLoop` to `eventServices`, built over the existing `eventChannelLayer` and `workerControlProvided`. Verify `bun dev` starts, a subscribe to the `workers` topic receives a snapshot, and the crawler supervisor still starts exactly once.

## 3. Folding Plane subscription and fold

- [x] 3.1 In `apps/folding-plane/src/realtime.ts`, add a `workersFrameStream` (subscribe on start, unsubscribe on teardown) and a `workersTopic` subscription entry gated on `route._tag === 'Workers' && isConnected`, keyed on `socketGeneration`; extend `eventMessageStream` so a decoded `workers` event emits `Message.ReceivedWorkers`. Verify `bun run test:web` realtime cases cover subscribe/unsubscribe frames and decoding the workers frame.
- [x] 3.2 Add `ReceivedWorkers` to `apps/folding-plane/src/message.ts`, a `foldWorkersReceived` root step that calls a new `Workers.receivedWorkers(rows)` step in `apps/folding-plane/src/page/workers/update.ts` (settling the rows to success), and wire the root update case. Verify a `page/workers/story.test.ts` case shows a received snapshot sets the rows, including recovering a page that had failed.
- [x] 3.3 Confirm the start/stop `refresh` remains and the page renders pushed rows without refetching. Verify a `page/workers/scene.test.ts` case renders a table updated by a received snapshot.

## 4. Integration

- [x] 4.1 With `bun dev` and `bun dev:web` running, open the Workers route and trigger a worker start/stop from a second tab or the API; verify the first tab's rows update live without a reload, and that leaving the route stops the `workers` subscription (server sees the unsubscribe). Record the observation.
