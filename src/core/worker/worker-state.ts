// Desired-state tracking for the worker control endpoint.
//
// The control endpoint owns desired state: `start` marks an exchange started,
// `stop` clears it. Guards reject duplicate transitions (start-when-running,
// stop-when-stopped) with CONFLICT before anything is published, so a rejected
// request never emits an event. The supervisor keeps its own actual-state
// tracking and independently ignores duplicate deliveries, so a repeated event
// can never spawn duplicate subprocesses.
const startedExchangeIds = new Set<number>();

export function isWorkerStarted(exchangeId: number): boolean {
  return startedExchangeIds.has(exchangeId);
}

export function markWorkerStarted(exchangeId: number): void {
  startedExchangeIds.add(exchangeId);
}

export function markWorkerStopped(exchangeId: number): void {
  startedExchangeIds.delete(exchangeId);
}

// Test-only reset to an empty (boot: start-nothing) state.
export function resetWorkerState(): void {
  startedExchangeIds.clear();
}
