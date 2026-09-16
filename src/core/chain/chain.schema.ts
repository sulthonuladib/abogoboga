import {
  createSelectSchema,
  createUpdateSchema,
  createInsertSchema,
} from "drizzle-zod";

import { chainTable } from "./chain.sql";
import z from "zod";
import {
  createPaginatedOutputSchema,
  createPaginationInputSchema,
} from "../../common/pagination.schema";

export const chainInsertSchema = createInsertSchema(chainTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const chainUpdateSchema = createUpdateSchema(chainTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const chainSelectSchema = createSelectSchema(chainTable);
export const chainSearchByKeysSchema = z.keyof(
  chainSelectSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  }),
);
export const chainOrderByKeysSchema = z.keyof(chainSelectSchema);
export const listChainSelectSchema = createPaginationInputSchema({
  searchByKeys: chainSearchByKeysSchema,
  orderByKeys: chainOrderByKeysSchema,
  defaultSearchBy: "name",
  defaultOrderBy: "id",
});

export const paginatedChainSelectSChema =
  createPaginatedOutputSchema(chainSelectSchema);
