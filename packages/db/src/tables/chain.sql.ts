import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "./drizzle.util";

export const chainTable = pg.pgTable("chain", {
  id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: pg.varchar({ length: 255 }).notNull(),
  code: pg.varchar({ length: 255 }).notNull().unique(),
  ...addDefaultTimestampFields(),
});
