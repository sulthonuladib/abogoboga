import { defineRelations } from "drizzle-orm/relations";
import {
  exchangeTable,
  exchangeCryptocurrencyTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  chainTable,
  opportunityTable,
} from "./schema";

const schema = {
  exchangeTable,
  exchangeCryptocurrencyTable,
  cryptocurrencyTable,
  exchangeCryptocurrencyChainTable,
  chainTable,
  opportunityTable,
};

export const dbRelations = defineRelations(schema, (r) => ({
  exchangeCryptocurrencyTable: {
    exchange: r.one.exchangeTable({
      from: r.exchangeCryptocurrencyTable.exchangeId,
      to: r.exchangeTable.id,
    }),
    cryptocurrency: r.one.cryptocurrencyTable({
      from: r.exchangeCryptocurrencyTable.cryptocurrencyId,
      to: r.cryptocurrencyTable.id,
    }),
    exchangeCryptocurrencyChains: r.many.exchangeCryptocurrencyChainTable(),
  },
  exchangeTable: {
    exchangeCryptocurrencies: r.many.exchangeCryptocurrencyTable(),
  },
  cryptocurrencyTable: {
    exchangeCryptocurrencies: r.many.exchangeCryptocurrencyTable(),
  },
  exchangeCryptocurrencyChainTable: {
    exchangeCryptocurrency: r.one.exchangeCryptocurrencyTable({
      from: r.exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
      to: r.exchangeCryptocurrencyTable.id,
    }),
    chain: r.one.chainTable({
      from: r.exchangeCryptocurrencyChainTable.chainId,
      to: r.chainTable.id,
    }),
  },
  chainTable: {
    exchangeCryptocurrencyChains: r.many.exchangeCryptocurrencyChainTable(),
  },
  opportunityTable: {
    cryptocurrency: r.one.cryptocurrencyTable({
      from: r.opportunityTable.cryptocurrencyId,
      to: r.cryptocurrencyTable.id,
    }),
    buyExchange: r.one.exchangeTable({
      from: r.opportunityTable.buyExchangeId,
      to: r.exchangeTable.id,
    }),
    sellExchange: r.one.exchangeTable({
      from: r.opportunityTable.sellExchangeId,
      to: r.exchangeTable.id,
    }),
  },
}));
