import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "./drizzle.util";
import { cryptocurrencyTable } from "./cryptocurrency.sql";
import { exchangeTable } from "./exchange.sql";

/**
 * One arbitrage opportunity: a buy/sell exchange pair for a coin, starting at
 * zero price and volume until ticks fill it in.
 *
 * A row means a viable transfer route exists between the two exchanges for the
 * coin; no chain id is stored. The triple
 * `(cryptocurrencyId, buyExchangeId, sellExchangeId)` is unique.
 */
export const opportunityTable = pg.pgTable(
  "opportunity",
  {
    id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
    cryptocurrencyId: pg
      .integer()
      .notNull()
      .references(() => cryptocurrencyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    buyExchangeId: pg
      .integer()
      .notNull()
      .references(() => exchangeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sellExchangeId: pg
      .integer()
      .notNull()
      .references(() => exchangeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    buyPrice: pg.doublePrecision().notNull().default(0),
    sellPrice: pg.doublePrecision().notNull().default(0),
    buyVolume: pg.doublePrecision().notNull().default(0),
    sellVolume: pg.doublePrecision().notNull().default(0),
    buyTickTimestamp: pg.bigint({ mode: "number" }).notNull().default(0),
    sellTickTimestamp: pg.bigint({ mode: "number" }).notNull().default(0),
    ...addDefaultTimestampFields(),
  },
  (table) => [
    pg.unique("opportunity_crypto_buy_sell_unique").on(
      table.cryptocurrencyId,
      table.buyExchangeId,
      table.sellExchangeId,
    ),
  ],
);
