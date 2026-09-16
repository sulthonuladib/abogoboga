import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "../../utils/drizzle.util";
import { exchangeCryptocurrencyTable } from "../exchange-cryptocurrency/exchange-cryptocurrency.sql";
import { exchangeTable } from "../exchange/exchange.sql";

export const orderbookSnapshotTable = pg.pgTable(
  "orderbook_snapshot",
  {
    id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
    exchangeCryptocurrencyId: pg
      .integer()
      .notNull()
      .unique()
      .references(() => exchangeCryptocurrencyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    exchangeId: pg
      .integer()
      .notNull()
      .references(() => exchangeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    buyPrice: pg.doublePrecision().notNull(),
    sellPrice: pg.doublePrecision().notNull(),
    buyAmount: pg.doublePrecision().notNull(),
    sellAmount: pg.doublePrecision().notNull(),
    tickTimestamp: pg.bigint({ mode: "number" }).notNull(),
    ...addDefaultTimestampFields(),
  },
);
