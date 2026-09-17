import {
  createSelectSchema,
  createUpdateSchema,
  createInsertSchema,
} from "drizzle-zod";

import { cryptocurrencyTable } from "./cryptocurrency.sql";
import z from "zod";
import {
  createPaginationInputSchema,
  createPaginatedOutputSchema,
} from "../../common/pagination.schema";

export const cryptocurrencySelectSchema =
  createSelectSchema(cryptocurrencyTable);
export const cryptocurrencyInsertSchema = createInsertSchema(
  cryptocurrencyTable,
  {
  }
).omit({
  createdAt: true,
  updatedAt: true,
});

export const cryptocurrencyUpdateSchema = createUpdateSchema(
  cryptocurrencyTable,
  {
    cmcId: z.coerce.number().optional(),
  },
).omit({
  logo: true,
  createdAt: true,
  updatedAt: true,
});
export const cryptocurrencySearchByKeysSchema = z.keyof(
  cryptocurrencySelectSchema.omit({
    createdAt: true,
    updatedAt: true,
    logo: true,
  }),
);
export const cryptocurrencyOrderByKeysSchema = z.keyof(
  cryptocurrencySelectSchema.omit({
    logo: true,
  }),
);
export const listCryptocurrencySelectSchema = createPaginationInputSchema({
  searchByKeys: cryptocurrencySearchByKeysSchema,
  orderByKeys: cryptocurrencyOrderByKeysSchema,
  defaultSearchBy: "symbol",
  defaultOrderBy: "cmcId",
  additional: {
    exchangeId: z.coerce.number().optional(),
    chainId: z.coerce.number().optional(),
  },
});
export const paginatedCryptocurrencySelectSchema = createPaginatedOutputSchema(
  cryptocurrencySelectSchema,
);

export const cryptocurrencyMetadataSelectSchema = cryptocurrencySelectSchema.extend({
  exchanges: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      slug: z.string(),
      symbol: z.string(),
      marketId: z.number(),
      listed: z.boolean(),
      tradeEnabled: z.boolean(),
      chains: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          code: z.string(),
          linkId: z.number(),
          exchangeChainCode: z.string(),
          exchangeChainName: z.string().nullable(),
          withdrawEnabled: z.boolean(),
          depositEnabled: z.boolean(),
        }),
      ),
    }),
  ),
});

export const listingStatsInputSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(-1).max(100).default(10),
  search: z.string().default(""),
  exchangeId: z.coerce.number().optional(),
  chainId: z.coerce.number().optional(),
  flag: z.enum(["all", "blocked", "single"]).default("all"),
  sortBy: z.enum(["symbol", "markets", "chains", "blocked"]).default("symbol"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const listingStatsItemSchema = cryptocurrencySelectSchema.extend({
  markets: z.number(),
  chains: z.number(),
  blocked: z.number(),
});

export const paginatedListingStatsSchema = createPaginatedOutputSchema(
  listingStatsItemSchema,
);
