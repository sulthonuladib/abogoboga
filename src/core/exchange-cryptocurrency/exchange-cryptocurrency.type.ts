import { exchangeCryptocurrencyTable } from "./exchange-cryptocurrency.sql";

export type ExchangeCryptocurrency =
  typeof exchangeCryptocurrencyTable.$inferSelect;
