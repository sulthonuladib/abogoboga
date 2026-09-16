import { ORPCError, os } from "@orpc/server";
import { openapi } from "@orpc/openapi";
import {
  exchangeCryptocurrencyInsertSchema,
  exchangeCryptocurrencySelectSchema,
  exchangeCryptocurrencyUpdateSchema,
} from "./exchange-cryptocurrency.schema";
import { database } from "../../database/connection";
import { exchangeCryptocurrencyTable } from "./exchange-cryptocurrency.sql";
import { eq } from "drizzle-orm";
import { ExchangeCryptocurrency } from "./exchange-cryptocurrency";
import { Exchange } from "../exchange/exchange";
import { Cryptocurrency } from "../cryptocurrency/cryptocurrency";
import z from "zod";

const assign = os
  .meta(openapi({ method: "POST", path: "/exchange-cryptocurrency/assign" }))
  .input(exchangeCryptocurrencyInsertSchema)
  .output(exchangeCryptocurrencySelectSchema)
  .handler(async ({ input }) => {
    if (!(await Exchange.getById(input.exchangeId))) {
      throw new ORPCError("NOT_FOUND", { message: "exchange not found" });
    }
    if (!(await Cryptocurrency.getById(input.cryptocurrencyId))) {
      throw new ORPCError("NOT_FOUND", { message: "cryptocurrency not found" });
    }
    if (await ExchangeCryptocurrency.exists(input)) {
      throw new ORPCError("CONFLICT", {
        message: "exchange with cryptocurrency already exists",
      });
    }
    let result;
    try {
      result = await database
        .insert(exchangeCryptocurrencyTable)
        .values(input)
        .returning()
        .then((result) => result.at(0));
    } catch (error) {
      // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw new ORPCError("CONFLICT", { message: "exchange with cryptocurrency already exists" });
      }
      throw error;
    }
    if (!result) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "something wrong when assigning exchange-cryptocurrency",
      });
    }

    return result;
  });

const update = os
  .meta(openapi({ method: "PATCH", path: "/exchange-cryptocurrency/{id}", inputStructure: "detailed" }))
  .input(
    z.object({
      params: z.object({ id: z.coerce.number() }),
      body: exchangeCryptocurrencyUpdateSchema,
    }),
  )
  .output(exchangeCryptocurrencySelectSchema)
  .handler(async ({ input }) => {
    if (!(await ExchangeCryptocurrency.getById(input.params.id))) {
      throw new ORPCError("NOT_FOUND", {
        message: "exchange-cryptocurrency assignment not found",
      });
    }

    const result = await ExchangeCryptocurrency.update(input.params.id, input.body);

    if (!result) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "something wrong when updating exchange-cryptocurrency",
      });
    }

    return result;
  });

const unassign = os
  .meta(openapi({ method: "DELETE", path: "/exchange-cryptocurrency/{id}" }))
  .input(z.object({ id: z.coerce.number() }))
  .handler(async ({ input }) => {
    const target = await ExchangeCryptocurrency.getById(input.id);
    if (!target) {
      throw new ORPCError("NOT_FOUND", {
        message: "exchange-cryptocurrency assignment not found",
      });
    }
    const result = await database
      .delete(exchangeCryptocurrencyTable)
      .where(eq(exchangeCryptocurrencyTable.id, input.id))
      .returning()
      .then((result) => result.at(0));

    if (!result) {
      throw new ORPCError("NOT_FOUND", {
        message: "exchange-cryptocurrency assignment not found",
      });
    }

    return result;
  });

const list = os
  .meta(openapi({ method: "POST", path: "/exchange-cryptocurrency/list" }))
  .input(
    z
      .object({
        exchangeId: z.coerce.number().optional(),
        cryptocurrencyId: z.coerce.number().optional(),
      })
      .optional(),
  )
  .output(z.array(exchangeCryptocurrencySelectSchema))
  .handler(async ({ input }) => {
    return await ExchangeCryptocurrency.getAll(input);
  });

const findById = os
  .meta(openapi({ method: "GET", path: "/exchange-cryptocurrency/{id}" }))
  .input(z.object({ id: z.coerce.number() }))
  .output(exchangeCryptocurrencySelectSchema)
  .handler(async ({ input }) => {
    const result = await ExchangeCryptocurrency.getById(input.id);
    if (!result) {
      throw new ORPCError("NOT_FOUND", {
        message: "exchange-cryptocurrency assignment not found",
      });
    }

    return result;
  });

export const exchangeCryptocurrencyRouter = os.router({
  assign,
  unassign,
  update,
  list,
  findById,
  count: os
    .meta(openapi({ method: "POST", path: "/exchange-cryptocurrency/count" }))
    .input(
      z
        .object({
          exchangeId: z.coerce.number().optional(),
          cryptocurrencyId: z.coerce.number().optional(),
        })
        .optional(),
    )
    .output(z.number())
    .handler(async ({ input }) => ExchangeCryptocurrency.count(input)),
});
