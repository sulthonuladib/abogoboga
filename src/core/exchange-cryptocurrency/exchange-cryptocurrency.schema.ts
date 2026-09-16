import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { exchangeCryptocurrencyTable } from "./exchange-cryptocurrency.sql";
import type z from "zod";

export const exchangeCryptocurrencyInsertSchema = createInsertSchema(
  exchangeCryptocurrencyTable,
).omit({ createdAt: true, updatedAt: true });

export const exchangeCryptocurrencyUpdateSchema = createUpdateSchema(
  exchangeCryptocurrencyTable,
).omit({ createdAt: true, updatedAt: true });

export const exchangeCryptocurrencySelectSchema = createSelectSchema(
  exchangeCryptocurrencyTable,
);

export const exchangeCryptocurrencyFilterExistsSchema =
  exchangeCryptocurrencySelectSchema.pick({
    exchangeId: true,
    cryptocurrencyId: true,
  });

export type ExchangeCryptocurrencyInsert = z.infer<
  typeof exchangeCryptocurrencyInsertSchema
>;

export type ExchangeCryptocurrencyUpdate = z.infer<
  typeof exchangeCryptocurrencyUpdateSchema
>;

export type ExchangeCryptocurrencySelect = z.infer<
  typeof exchangeCryptocurrencySelectSchema
>;

export type ExchangeCryptocurrencyFilterExists = z.infer<
  typeof exchangeCryptocurrencyFilterExistsSchema
>;
