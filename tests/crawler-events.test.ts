import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { router } from "../src/router";
import { UserActionQueue } from "../src/queues/user-action.queue";

describe("worker events (2.1/2.4)", () => {
  test("OpenAPI exposes POST /worker/control", async () => {
    const document = await new OpenAPIGenerator({
      converters: [new ZodToJsonSchemaConverter()],
    }).generate(router, {
      base: { info: { title: "Test API", version: "1.0.0" } },
    });
    const paths = document.paths as unknown as Record<string, Record<string, unknown>>;
    expect(paths["/worker/control"]?.post).toBeDefined();
  });

  test("failed validation publishes no worker-changed event", async () => {
    const ac = new AbortController();
    const iter = UserActionQueue.subscribe("worker-changed", { signal: ac.signal });
    const next = iter.next();
    // SAFETY: invalid action fails Zod validation before the handler runs.
    await expect(
      call(router.worker.control, { exchangeId: 1, action: "restart" } as never, {
        context: {},
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const winner = await Promise.race([
      next.then(() => "event" as const),
      Bun.sleep(200).then(() => "timeout" as const),
    ]);
    ac.abort();
    expect(winner).toBe("timeout");
  });
});
