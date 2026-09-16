import { exchangeCryptocurrencyChainTable } from "./exchange-cryptocurrency-chain.sql";

export type ExchangeCryptocurrencyChain =
  typeof exchangeCryptocurrencyChainTable.$inferSelect;
