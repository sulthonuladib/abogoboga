import { ORPCError, os } from "@orpc/server";
import { openapi } from "@orpc/openapi";
import { Chain } from "./chain";
import {
  chainInsertSchema,
  chainSelectSchema,
  chainUpdateSchema,
  listChainSelectSchema,
  paginatedChainSelectSChema,
} from "./chain.schema";
import z from "zod";

export const chainRouter = {
  add: os
    .meta(openapi({ method: "POST", path: "/chain/add" }))
    .input(chainInsertSchema)
    .output(chainSelectSchema)
    .handler(async ({ input }) => {
      if (await Chain.codeExists(input.code)) {
        throw new ORPCError("CONFLICT", {
          message: "chain with this code already exists",
        });
      }
      let result;
      try {
        result = await Chain.add(input);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "code is already in use" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "something wrong when adding chain",
        });
      }

      return result;
    }),

  list: os
    .meta(openapi({ method: "POST", path: "/chain/list" }))
    .input(listChainSelectSchema)
    .output(paginatedChainSelectSChema)
    .handler(async ({ input }) => {
      return await Chain.list(input);
    }),

  findById: os
    .meta(openapi({ method: "GET", path: "/chain/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(chainSelectSchema)
    .handler(async ({ input }) => {
      const result = await Chain.getById(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "chain not found",
        });
      }

      return result;
    }),

  update: os
    .meta(openapi({ method: "PATCH", path: "/chain/{id}", inputStructure: "detailed" }))
    .input(
      z.object({
        params: z.object({ id: z.coerce.number() }),
        body: chainUpdateSchema,
      }),
    )
    .output(chainSelectSchema)
    .handler(async ({ input }) => {
      const target = await Chain.getById(input.params.id);
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: "chain not found",
        });
      }
      if (input?.body?.code) {
        const byCode = await Chain.getByCode(input.body.code);
        if (byCode && byCode.id !== input.params.id) {
          throw new ORPCError("CONFLICT", {
            message: "code is already in use",
          });
        }
      }

      let result;
      try {
        result = await Chain.update(input.params.id, input.body);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "code is already in use" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "chain not found",
        });
      }

      return result;
    }),

  remove: os
    .meta(openapi({ method: "DELETE", path: "/chain/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(chainSelectSchema)
    .handler(async ({ input }) => {
      const result = await Chain.remove(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "chain not found",
        });
      }

      return result;
    }),
};
