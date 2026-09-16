import type z from "zod";
import type {
  exchangeInsertSchema,
  exchangeSelectSchema,
  exchangeUpdateSchema,
  listExchangeSelectSchema,
  paginatedExchangeSelectSchema,
} from "./exchange.schema";
import { exchangeTable } from "./exchange.sql";

export type Exchange = typeof exchangeTable.$inferSelect;
export type ExchangeSelect = z.infer<typeof exchangeSelectSchema>;
export type ExchangeInsert = z.infer<typeof exchangeInsertSchema>;
export type ExchangeUpdate = z.infer<typeof exchangeUpdateSchema>;
export type ListExchangeInput = z.infer<typeof listExchangeSelectSchema>;
export type PaginatedExchangeList = z.infer<
  typeof paginatedExchangeSelectSchema
>;
