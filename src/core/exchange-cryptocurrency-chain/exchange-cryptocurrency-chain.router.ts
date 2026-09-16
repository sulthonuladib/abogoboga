import { ORPCError, os } from "@orpc/server";
import { openapi } from "@orpc/openapi";
import {
  exchangeCryptocurrencyChainInsertSchema,
  exchangeCryptocurrencyChainSelectSchema,
  exchangeCryptocurrencyChainUpdateSchema,
} from "./exchange-cryptocurrency-chain.schema";
import { ExchangeCryptocurrencyChain } from "./exchange-cryptocurrency-chain";
import { ExchangeCryptocurrency } from "../exchange-cryptocurrency/exchange-cryptocurrency";
import { Chain } from "../chain/chain";
import z from "zod";

export const exchangeCryptocurrencyChainRouter = {
  add: os
    .meta(openapi({ method: "POST", path: "/exchange-cryptocurrency-chain/add" }))
    .input(
      exchangeCryptocurrencyChainInsertSchema.extend({
        exchangeCryptocurrencyId: z.coerce.number(),
        chainId: z.coerce.number(),
      }),
    )
    .output(exchangeCryptocurrencyChainSelectSchema)
    .handler(async ({ input }) => {
      if (!(await ExchangeCryptocurrency.getById(input.exchangeCryptocurrencyId))) {
        throw new ORPCError("NOT_FOUND", { message: "exchange-cryptocurrency assignment not found" });
      }
      if (!(await Chain.getById(input.chainId))) {
        throw new ORPCError("NOT_FOUND", { message: "chain not found" });
      }
      if (await ExchangeCryptocurrencyChain.exists(input)) {
        throw new ORPCError("CONFLICT", {
          message: "exchange-cryptocurrency-chain assignment already exists",
        });
      }

      let result;
      try {
        result = await ExchangeCryptocurrencyChain.add(input);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "exchange-cryptocurrency-chain assignment already exists" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "something wrong when adding exchange-cryptocurrency-chain",
        });
      }

      return result;
    }),

  list: os
    .meta(openapi({ method: "POST", path: "/exchange-cryptocurrency-chain/list" }))
    .input(
      z
        .object({
          exchangeCryptocurrencyId: z.coerce.number().optional(),
          chainId: z.coerce.number().optional(),
        })
        .optional(),
    )
    .output(z.array(exchangeCryptocurrencyChainSelectSchema))
    .handler(async ({ input }) => {
      return await ExchangeCryptocurrencyChain.getAll(input);
    }),

  findById: os
    .meta(openapi({ method: "GET", path: "/exchange-cryptocurrency-chain/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(exchangeCryptocurrencyChainSelectSchema)
    .handler(async ({ input }) => {
      const result = await ExchangeCryptocurrencyChain.getById(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "exchange-cryptocurrency-chain not found",
        });
      }

      return result;
    }),

  update: os
    .meta(openapi({ method: "PATCH", path: "/exchange-cryptocurrency-chain/{id}", inputStructure: "detailed" }))
    .input(
      z.object({
        params: z.object({ id: z.coerce.number() }),
        body: exchangeCryptocurrencyChainUpdateSchema,
      }),
    )
    .output(exchangeCryptocurrencyChainSelectSchema)
    .handler(async ({ input }) => {
      const target = await ExchangeCryptocurrencyChain.getById(input.params.id);
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: "exchange-cryptocurrency-chain not found",
        });
      }
      if (input.body.exchangeCryptocurrencyId !== undefined && !(await ExchangeCryptocurrency.getById(input.body.exchangeCryptocurrencyId))) {
        throw new ORPCError("NOT_FOUND", { message: "exchange-cryptocurrency assignment not found" });
      }
      if (input.body.chainId !== undefined && !(await Chain.getById(input.body.chainId))) {
        throw new ORPCError("NOT_FOUND", { message: "chain not found" });
      }
      if (input.body.exchangeCryptocurrencyId !== undefined || input.body.chainId !== undefined) {
        const duplicates = await ExchangeCryptocurrencyChain.getAll({
          exchangeCryptocurrencyId: input.body.exchangeCryptocurrencyId ?? target.exchangeCryptocurrencyId,
          chainId: input.body.chainId ?? target.chainId,
        });
        if (duplicates.some((row) => row.id !== input.params.id)) {
          throw new ORPCError("CONFLICT", { message: "exchange-cryptocurrency-chain assignment already exists" });
        }
      }

      let result;
      try {
        result = await ExchangeCryptocurrencyChain.update(input.params.id, input.body);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "exchange-cryptocurrency-chain assignment already exists" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "something wrong when updating exchange-cryptocurrency-chain",
        });
      }

      return result;
    }),

  remove: os
    .meta(openapi({ method: "DELETE", path: "/exchange-cryptocurrency-chain/{id}" }))
    .input(z.object({ id: z.coerce.number() }))
    .output(exchangeCryptocurrencyChainSelectSchema)
    .handler(async ({ input }) => {
      const result = await ExchangeCryptocurrencyChain.remove(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "exchange-cryptocurrency-chain not found",
        });
      }

      return result;
    }),
};
