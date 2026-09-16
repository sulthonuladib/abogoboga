import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { exchangeCryptocurrencyChainTable } from "./exchange-cryptocurrency-chain.sql";
import type z from "zod";

export const exchangeCryptocurrencyChainInsertSchema = createInsertSchema(
  exchangeCryptocurrencyChainTable,
).omit({ createdAt: true, updatedAt: true });

export const exchangeCryptocurrencyChainUpdateSchema = createUpdateSchema(
  exchangeCryptocurrencyChainTable,
).omit({
  createdAt: true,
  updatedAt: true,
});

export const exchangeCryptocurrencyChainSelectSchema = createSelectSchema(
  exchangeCryptocurrencyChainTable,
);

export const exchangeCryptocurrencyChainFilterExistsSchema =
  exchangeCryptocurrencyChainSelectSchema.pick({
    exchangeCryptocurrencyId: true,
    chainId: true,
  });

export type ExchangeCryptocurrencyChainInsert = z.infer<
  typeof exchangeCryptocurrencyChainInsertSchema
>;

export type ExchangeCryptocurrencyChainUpdate = z.infer<
  typeof exchangeCryptocurrencyChainUpdateSchema
>;

export type ExchangeCryptocurrencyChainSelect = z.infer<
  typeof exchangeCryptocurrencyChainSelectSchema
>;

export type ExchangeCryptocurrencyChainFilterExists = z.infer<
  typeof exchangeCryptocurrencyChainFilterExistsSchema
>;
