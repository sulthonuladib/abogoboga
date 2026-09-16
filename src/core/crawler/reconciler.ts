import { Exchange } from "../exchange/exchange";
import { getEligibleCoins, type EligibleCoin } from "./eligible-set";
import { Supervisor } from "./supervisor";
import { UserActionQueue, type CoinDetailChangedEvent } from "../../queues/user-action.queue";
import type { BootstrapCoin } from "./crawler.contract";

function toBootstrap(coins: EligibleCoin[]): BootstrapCoin[] {
  return coins.map((c) => ({ symbol: c.symbol, cmcId: c.cmcId }));
}

// Converge one exchange to current DB truth. Payload identity selects the
// exchange; subscription state is recomputed, never trusted from the event.
export async function reconcileExchange(
  supervisor: Supervisor,
  exchangeId: number,
  fetchEligible: (exchangeId: number) => Promise<EligibleCoin[]> = getEligibleCoins,
): Promise<void> {
  if (!supervisor.isRunning(exchangeId)) return;
  const eligible = await fetchEligible(exchangeId);
  const want = new Map(eligible.map((c) => [`${c.symbol}:${c.cmcId}`, c]));
  const have = new Map<string, BootstrapCoin>();
  for (const shard of supervisor.shardCoins(exchangeId)) {
    for (const coin of shard) have.set(`${coin.symbol}:${coin.cmcId}`, coin);
  }
  const toAdd: BootstrapCoin[] = [];
  for (const [key, coin] of want) {
    if (!have.has(key)) toAdd.push({ symbol: coin.symbol, cmcId: coin.cmcId });
  }
  const toRemove: BootstrapCoin[] = [];
  for (const [key, coin] of have) {
    if (!want.has(key)) toRemove.push(coin);
  }
  if (toRemove.length) await supervisor.removeCoins(exchangeId, toRemove);
  if (toAdd.length) await supervisor.addCoins(exchangeId, toAdd);
}

export async function handleCoinDetailChanged(
  supervisor: Supervisor,
  event: CoinDetailChangedEvent,
  fetchEligible: (exchangeId: number) => Promise<EligibleCoin[]> = getEligibleCoins,
): Promise<void> {
  await reconcileExchange(supervisor, event.exchangeId, fetchEligible);
}

// Long-lived same-process listeners: endpoint handlers publish, the
// supervisor reconciles. Call once from the API entrypoint.
export function attachReconciler(supervisor: Supervisor): () => void {
  let stopped = false;
  void (async () => {
    const sub = UserActionQueue.subscribe("worker-changed", {});
    for await (const event of sub) {
      if (stopped) break;
      if (event.action === "stop") {
        await supervisor.stopExchange(event.exchangeId);
      } else {
        if (supervisor.isRunning(event.exchangeId)) continue;
        const exchange = await Exchange.getById(event.exchangeId);
        if (!exchange) continue;
        const eligible = await getEligibleCoins(event.exchangeId);
        await supervisor.startExchange(
          event.exchangeId,
          exchange.slug,
          toBootstrap(eligible),
        );
      }
    }
  })();
  void (async () => {
    const sub = UserActionQueue.subscribe("coin-detail-changed", {});
    for await (const event of sub) {
      if (stopped) break;
      await handleCoinDetailChanged(supervisor, event);
    }
  })();
  return () => {
    stopped = true;
  };
}
