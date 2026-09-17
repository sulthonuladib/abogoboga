import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "./drizzle.util";

export const cryptocurrencyTable = pg.pgTable("cryptocurrency", {
  id: pg.serial().primaryKey(),
  name: pg.varchar({ length: 255 }).notNull(),
  symbol: pg.varchar({ length: 255 }).notNull(),
  slug: pg.varchar({ length: 255 }).notNull().unique(),
  logo: pg.varchar({ length: 255 }).notNull(),
  cmcId: pg.integer().notNull().unique(),
  ...addDefaultTimestampFields(),
});
