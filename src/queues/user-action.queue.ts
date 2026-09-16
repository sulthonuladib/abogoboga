import { MemoryPublisher } from "@orpc/publisher/memory";

export const UserActionQueue = new MemoryPublisher<{
  "worker-changed": {
    exchangeId: string;
    action: "start" | "stop";
  };
  "coin-updated": {};
}>();
