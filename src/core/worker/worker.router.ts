import { ORPCError, os } from "@orpc/server";
import { openapi } from "@orpc/openapi";
import z from "zod";
import { Exchange } from "../exchange/exchange";
import { UserActionQueue } from "../../queues/user-action.queue";
import { isWorkerStarted, markWorkerStarted, markWorkerStopped } from "./worker-state";

export const workerControlInputSchema = z.object({
  exchangeId: z.coerce.number().int(),
  action: z.enum(["start", "stop"]),
});

export const workerControlOutputSchema = z.object({
  exchangeId: z.number().int(),
  action: z.enum(["start", "stop"]),
});

export const workerRouter = {
  control: os
    .meta(openapi({ method: "POST", path: "/worker/control" }))
    .input(workerControlInputSchema)
    .output(workerControlOutputSchema)
    .handler(async ({ input }) => {
      const exchange = await Exchange.getById(input.exchangeId);
      if (!exchange) {
        throw new ORPCError("NOT_FOUND", { message: "exchange not found" });
      }
      if (input.action === "start" && isWorkerStarted(input.exchangeId)) {
        throw new ORPCError("CONFLICT", {
          message: "exchange worker is already running",
        });
      }
      if (input.action === "stop" && !isWorkerStarted(input.exchangeId)) {
        throw new ORPCError("CONFLICT", {
          message: "exchange worker is not running",
        });
      }
      await UserActionQueue.publish("worker-changed", {
        exchangeId: input.exchangeId,
        action: input.action,
      });
      if (input.action === "start") {
        markWorkerStarted(input.exchangeId);
      } else {
        markWorkerStopped(input.exchangeId);
      }
      return { exchangeId: input.exchangeId, action: input.action };
    }),
};
