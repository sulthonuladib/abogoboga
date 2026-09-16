import * as pg from "drizzle-orm/pg-core";
import { exchangeTable } from "../exchange/exchange.sql";
import { cryptocurrencyTable } from "../cryptocurrency/cryptocurrency.sql";
import { addDefaultTimestampFields } from "../../utils/drizzle.util";

export const exchangeCryptocurrencyTable = pg.pgTable(
  "exchange_cryptocurrency",
  {
    id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
    exchangeId: pg
      .integer()
      .notNull()
      .references(() => exchangeTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    cryptocurrencyId: pg
      .integer()
      .notNull()
      .references(() => cryptocurrencyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    exchangeSymbol: pg.varchar({ length: 255 }).notNull(),
    ...addDefaultTimestampFields(),
  },
  (table) => [
    pg.unique("exchange_cryptocurrency_exchange_crypto_unique").on(
      table.exchangeId,
      table.cryptocurrencyId,
    ),
  ],
);
