import { cryptocurrencyRouter } from "./core/cryptocurrency/cryptocurrency.router";
import { exchangeCryptocurrencyRouter } from "./core/exchange-cryptocurrency/exchange-cryptocurrency.router";
import { exchangeCryptocurrencyChainRouter } from "./core/exchange-cryptocurrency-chain/exchange-cryptocurrency-chain.router";
import { exchangeRouter } from "./core/exchange/exchange.router";
import { chainRouter } from "./core/chain/chain.router";
import { utilityRouter } from "./core/utility/utility.router";
import { workerRouter } from "./core/worker/worker.router";

export const router = {
  exchange: exchangeRouter,
  cryptocurrency: cryptocurrencyRouter,
  exchangeCryptocurrency: exchangeCryptocurrencyRouter,
  exchangeCryptocurrencyChain: exchangeCryptocurrencyChainRouter,
  chain: chainRouter,
  utility: utilityRouter,
  worker: workerRouter,
};
