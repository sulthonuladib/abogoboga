import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "./drizzle.util";

export const exchangeBaseCurrencyPgEnum = pg.pgEnum("exchangeBaseCurrency", [
  "usdt",
  "idr",
]);

export const exchangeTable = pg.pgTable("exchange", {
  id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
  coingeckoId: pg.varchar({ length: 255 }).notNull().unique(),
  name: pg.varchar({ length: 255 }).notNull(),
  slug: pg.varchar({ length: 255 }).notNull().unique(),
  logo: pg.varchar({ length: 255 }).notNull(),
  registeredOnCmc: pg.boolean().notNull().default(true),
  baseCurrency: exchangeBaseCurrencyPgEnum().notNull(),
  ...addDefaultTimestampFields(),
});
