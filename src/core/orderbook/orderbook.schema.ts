import {
  createInsertSchema,
  createSelectSchema,
} from "drizzle-zod";
import { orderbookSnapshotTable } from "./orderbook.sql";
import type z from "zod";

export const orderbookSnapshotInsertSchema = createInsertSchema(
  orderbookSnapshotTable,
).omit({ createdAt: true, updatedAt: true });

export const orderbookSnapshotSelectSchema = createSelectSchema(
  orderbookSnapshotTable,
);

export type OrderbookSnapshotInsert = z.infer<
  typeof orderbookSnapshotInsertSchema
>;
export type OrderbookSnapshotSelect = z.infer<
  typeof orderbookSnapshotSelectSchema
>;
