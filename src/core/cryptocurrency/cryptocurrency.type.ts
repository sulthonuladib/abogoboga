import type z from "zod";

import type {
  cryptocurrencyInsertSchema,
  cryptocurrencySelectSchema,
  cryptocurrencyUpdateSchema,
  cryptocurrencyMetadataSelectSchema,
  listCryptocurrencySelectSchema,
  listingStatsInputSchema,
  paginatedCryptocurrencySelectSchema,
  paginatedListingStatsSchema,
} from "./cryptocurrency.schema";
import { cryptocurrencyTable } from "./cryptocurrency.sql";

export type Cryptocurrency = typeof cryptocurrencyTable.$inferSelect;
export type CryptocurrencySelect = z.infer<typeof cryptocurrencySelectSchema>;
export type CryptocurrencyInsert = z.infer<typeof cryptocurrencyInsertSchema>;
export type CryptocurrencyUpdate = z.infer<typeof cryptocurrencyUpdateSchema>;
export type ListCryptocurrencyInput = z.infer<
  typeof listCryptocurrencySelectSchema
>;
export type PaginatedCryptocurrencyList = z.infer<
  typeof paginatedCryptocurrencySelectSchema
>;
export type ListingStatsInput = z.infer<typeof listingStatsInputSchema>;
export type ListingStatsRow = PaginatedListingStats["data"][number];
export type CryptocurrencyMetadata = z.infer<
  typeof cryptocurrencyMetadataSelectSchema
>;
export type PaginatedListingStats = z.infer<typeof paginatedListingStatsSchema>;
