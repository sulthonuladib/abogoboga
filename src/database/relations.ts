import { relations } from "drizzle-orm/relations";
import {
  exchangeTable,
  exchangeCryptocurrencyTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  chainTable,
} from "./schema";

export const exchangeCryptocurrencyRelations = relations(
  exchangeCryptocurrencyTable,
  ({ one, many }) => ({
    exchange: one(exchangeTable, {
      fields: [exchangeCryptocurrencyTable.exchangeId],
      references: [exchangeTable.id],
    }),
    cryptocurrency: one(cryptocurrencyTable, {
      fields: [exchangeCryptocurrencyTable.cryptocurrencyId],
      references: [cryptocurrencyTable.id],
    }),
    exchangeCryptocurrencyChains: many(exchangeCryptocurrencyChainTable),
  }),
);

export const exchangeRelations = relations(exchangeTable, ({ many }) => ({
  exchangeCryptocurrencies: many(exchangeCryptocurrencyTable),
}));

export const cryptocurrencyRelations = relations(
  cryptocurrencyTable,
  ({ many }) => ({
    exchangeCryptocurrencies: many(exchangeCryptocurrencyTable),
  }),
);

export const exchangeCryptocurrencyChainRelations = relations(
  exchangeCryptocurrencyChainTable,
  ({ one }) => ({
    exchangeCryptocurrency: one(exchangeCryptocurrencyTable, {
      fields: [exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId],
      references: [exchangeCryptocurrencyTable.id],
    }),
    chain: one(chainTable, {
      fields: [exchangeCryptocurrencyChainTable.chainId],
      references: [chainTable.id],
    }),
  }),
);

export const chainRelations = relations(chainTable, ({ many }) => ({
  exchangeCryptocurrencyChains: many(exchangeCryptocurrencyChainTable),
}));
