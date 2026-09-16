import * as pg from "drizzle-orm/pg-core";

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
