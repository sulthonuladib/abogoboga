// Export all database table schemas
export {
  exchangeBaseCurrencyPgEnum,
  exchangeTable,
} from "./tables/exchange.sql";

export { cryptocurrencyTable } from "./tables/cryptocurrency.sql";

export { exchangeCryptocurrencyTable } from "./tables/exchange-cryptocurrency.sql";

export { exchangeCryptocurrencyChainTable } from "./tables/exchange-cryptocurrency-chain.sql";

export { chainTable } from "./tables/chain.sql";

export { orderbookSnapshotTable } from "./tables/orderbook.sql";
