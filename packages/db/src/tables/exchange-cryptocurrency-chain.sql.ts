import * as pg from "drizzle-orm/pg-core";
import { addDefaultTimestampFields } from "./drizzle.util";
import { exchangeCryptocurrencyTable } from "./exchange-cryptocurrency.sql";
import { chainTable } from "./chain.sql";

export const exchangeCryptocurrencyChainTable = pg.pgTable(
  "exchange_cryptocurrency_chain",
  {
    id: pg.integer().primaryKey().generatedAlwaysAsIdentity(),
    exchangeChainCode: pg.varchar({ length: 255 }).notNull(),
    exchangeCryptocurrencyId: pg
      .integer()
      .notNull()
      .references(() => exchangeCryptocurrencyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chainId: pg
      .integer()
      .notNull()
      .references(() => chainTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    exchangeChainName: pg.varchar({ length: 255 }),
    withdrawEnabled: pg.boolean().notNull().default(true),
    depositEnabled: pg.boolean().notNull().default(true),
    ...addDefaultTimestampFields(),
  },
  (table) => [
    pg.unique("exchange_cryptocurrency_chain_unique").on(
      table.exchangeCryptocurrencyId,
      table.chainId,
    ),
  ],
);
