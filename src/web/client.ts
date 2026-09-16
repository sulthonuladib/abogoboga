import { createRouterClient } from "@orpc/server";
import { router } from "../router";

export const api = createRouterClient(router, {
  context: {},
});
