import { ORPCError, os } from "@orpc/server";
import z from "zod";

import { Cryptocurrency } from "./cryptocurrency";
import {
  cryptocurrencyInsertSchema,
  cryptocurrencySelectSchema,
  cryptocurrencyUpdateSchema,
  listCryptocurrencySelectSchema,
  paginatedCryptocurrencySelectSchema,
  cryptocurrencyMetadataSelectSchema,
} from "./cryptocurrency.schema";

export const cryptocurrencyRouter = {
  add: os
    .route({ method: "POST", path: "/cryptocurrency/add" })
    .input(cryptocurrencyInsertSchema)
    .output(cryptocurrencySelectSchema)
    .errors({
      CRYPTOCURRENCY_EXISTS: { message: "cryptocurrency with this cmcId already exists", statusCode: 409 },
      SLUG_EXISTS: { message: "slug is already in use", statusCode: 409 },
      SOMETHING_WRONG: { message: "something wrong when adding cryptocurrency", statusCode: 500 },
    })
    .handler(async ({ input, errors }) => {
      if (await Cryptocurrency.cmcIdExists(input.cmcId)) {
        throw errors.CRYPTOCURRENCY_EXISTS;
      }
      if (await Cryptocurrency.getBySlug(input.slug)) {
        throw errors.SLUG_EXISTS();
      }

      const result = await Cryptocurrency.add(input);
      if (!result) {
        throw errors.SOMETHING_WRONG();
      }
      return result;
    }),

  list: os
    .route({ method: "POST", path: "/cryptocurrency/list" })
    .input(listCryptocurrencySelectSchema)
    .output(paginatedCryptocurrencySelectSchema)
    .handler(async ({ input }) => {
      const result = await Cryptocurrency.list(input);
      return result;
    }),

  findById: os
    .route({ method: "GET", path: "/cryptocurrency/{id}" })
    .input(z.object({ id: z.coerce.number() }))
    .output(cryptocurrencySelectSchema)
    .handler(async ({ input }) => {
      const result = await Cryptocurrency.getById(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "cryptocurrency not found",
        });
      }

      return result;
    }),

  update: os
    .route({ method: "PATCH", path: "/cryptocurrency/{id}", inputStructure: "detailed" })
    .input(
      z.object({
        params: z.object({ id: z.coerce.number() }),
        body: cryptocurrencyUpdateSchema,
      }),
    )
    .output(cryptocurrencySelectSchema)
    .handler(async ({ input }) => {
      const target = await Cryptocurrency.getById(input.params.id);
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: "cryptocurrency not found",
        });
      }
      if (input?.body?.cmcId) {
        const byCmcId = await Cryptocurrency.getByCmcId(input.body.cmcId);
        if (byCmcId && byCmcId.id !== input.params.id) {
          throw new ORPCError("CONFLICT", {
            message: "cmcId is already in use",
          });
        }
      }
      if (input?.body?.slug) {
        const bySlug = await Cryptocurrency.getBySlug(input.body.slug);
        if (bySlug && bySlug.id !== input.params.id) {
          throw new ORPCError("CONFLICT", { message: "slug is already in use" });
        }
      }

      let result;
      try {
        result = await Cryptocurrency.update(input.params.id, input.body);
      } catch (error) {
        // SAFETY: PostgreSQL driver errors expose a string SQLSTATE code.
        if (error instanceof Error && "code" in error && error.code === "23505") {
          throw new ORPCError("CONFLICT", { message: "cryptocurrency already exists" });
        }
        throw error;
      }
      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "something wrong when updating cryptocurrency",
        });
      }
      return result;
    }),

  remove: os
    .route({ method: "DELETE", path: "/cryptocurrency/{id}" })
    .input(z.object({ id: z.coerce.number() }))
    .output(cryptocurrencySelectSchema)
    .handler(async ({ input }) => {
      const result = await Cryptocurrency.remove(input.id);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "cryptocurrency not found",
        });
      }

      return result;
    }),

  metadata: os
    .route({ method: "POST", path: "/cryptocurrency/metadata" })
    .input(z.union([z.object({ id: z.coerce.number() }), z.object({ slug: z.string().min(1) })]))
    .output(cryptocurrencyMetadataSelectSchema)
    .handler(async ({ input }) => {
      const result = await Cryptocurrency.getMetadata(input);
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "cryptocurrency not found",
        });
      }
      return result;
    }),
};
