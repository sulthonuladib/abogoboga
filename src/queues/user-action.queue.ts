import { MemoryPublisher } from "@orpc/publisher/memory";

export type WorkerChangedEvent = {
  exchangeId: number;
  action: "start" | "stop";
};

export type CoinDetailChangedKind =
  | "mapping-added"
  | "mapping-updated"
  | "mapping-removed"
  | "chain-added"
  | "chain-updated"
  | "chain-removed";

export type CoinDetailChangedEvent = {
  exchangeCryptocurrencyId: number;
  exchangeId: number;
  cryptocurrencyId: number;
  chainId?: number;
  kind: CoinDetailChangedKind;
};

export const UserActionQueue = new MemoryPublisher<{
  "worker-changed": WorkerChangedEvent;
  "coin-detail-changed": CoinDetailChangedEvent;
}>();
