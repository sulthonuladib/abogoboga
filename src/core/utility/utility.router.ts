import { os } from "@orpc/server";

import { cryptocurrencyTable } from "../cryptocurrency/cryptocurrency.sql";
import { exchangeTable } from "../exchange/exchange.sql";
import { chainTable } from "../chain/chain.sql";
import { exchangeCryptocurrencyTable } from "../exchange-cryptocurrency/exchange-cryptocurrency.sql";
import { exchangeCryptocurrencyChainTable } from "../exchange-cryptocurrency-chain/exchange-cryptocurrency-chain.sql";
import { reset } from "drizzle-seed";
import z from "zod";
import { database } from "../../database/connection";

const clearDatabase = os
  .route({ method: "POST", path: "/utility/clear-database" })
  .output(z.void())
  .handler(async () => {
    await reset(database, {
      cryptocurrency: cryptocurrencyTable,
      exchange: exchangeTable,
      chain: chainTable,
      exchangeCryptocurrency: exchangeCryptocurrencyTable,
      exchangeCryptocurrencyChain: exchangeCryptocurrencyChainTable,
    });
    return undefined;
  });

const ping = os
  .route({ method: "GET", path: "/utility/ping" })
  .output(z.literal("OK"))
  .handler(() => {
    return "OK";
  });

export const utilityRouter = {
  clearDatabase,
  ping,
};
