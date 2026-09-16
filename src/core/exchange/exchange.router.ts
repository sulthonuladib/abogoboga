import { ORPCError, os } from "@orpc/server";
import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { Exchange } from "./exchange";
import {
  exchangeInsertSchema,
  exchangeSelectSchema,
  exchangeUpdateSchema,
  listExchangeSelectSchema,
  paginatedExchangeSelectSchema,
} from "./exchange.schema";

export const exchangeRouter = {
  add: os
    .meta(openapi({ method: "POST", path: "/exchange/add" }))
    .input(exchangeInsertSchema)
    .output(exchangeSelectSchema)
    .handler(async ({ input }) => {
      if (await Exchange.cmcIdExists(input.cmcId)) {
        throw new ORPCError("CONFLICT", {
          message: "exchange with this cmcId already exists",
        });
      }
      if (await Exchange.getBySlug(input.slug)) {
        throw new ORPCError("CONFLICT", { message: "slug is already in use" });
      }
      let result;
      try {
        result = await Exchange.add(input);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "exchange already exists" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "something wrong when adding exchange",
        });
      }
      return result;
    }),

  list: os
    .meta(openapi({ method: "POST", path: "/exchange/list" }))
    .input(listExchangeSelectSchema)
    .output(paginatedExchangeSelectSchema)
    .handler(async ({ input }) => {
      return await Exchange.list(input);
    }),

  findById: os
    .meta(openapi({ method: "GET", path: "/exchange/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(exchangeSelectSchema)
    .handler(async ({ input }) => {
      const result = await Exchange.getById(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "exchange not found",
        });
      }
      return result;
    }),

  update: os
    .meta(openapi({ method: "PATCH", path: "/exchange/{id}", inputStructure: "detailed" }))
    .input(
      z.object({
        params: z.object({ id: z.coerce.number() }),
        body: exchangeUpdateSchema,
      }),
    )
    .output(exchangeSelectSchema)
    .handler(async ({ input }) => {
      const target = await Exchange.getById(input.params.id);
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: "exchange not found",
        });
      }
      if (input?.body?.cmcId) {
        const byCmcId = await Exchange.getByCmcId(input.body.cmcId);
        if (byCmcId && byCmcId.id !== input.params.id) {
          throw new ORPCError("CONFLICT", {
            message: "cmcId is already in use",
          });
        }
      }
      if (input?.body?.slug) {
        const bySlug = await Exchange.getBySlug(input.body.slug);
        if (bySlug && bySlug.id !== input.params.id) {
          throw new ORPCError("CONFLICT", { message: "slug is already in use" });
        }
      }
      let result;
      try {
        result = await Exchange.update(input.params.id, input.body);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "exchange already exists" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "something wrong when updating exchange",
        });
      }
      return result;
    }),

  remove: os
    .meta(openapi({ method: "DELETE", path: "/exchange/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(exchangeSelectSchema)
    .handler(async ({ input }) => {
      const result = await Exchange.remove(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND");
      }

      return result;
    }),
};
