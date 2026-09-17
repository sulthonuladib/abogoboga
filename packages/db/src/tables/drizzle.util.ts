import * as pg from "drizzle-orm/pg-core";

/**
 * Shared timestamp columns for all tables.
 *
 * @returns `createdAt`/`updatedAt` column definitions with database defaults.
 */
export function addDefaultTimestampFields() {
  return {
    createdAt: pg.timestamp({ mode: "date" }).notNull().defaultNow(),
    updatedAt: pg
      .timestamp({ mode: "date" })
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  };
}
