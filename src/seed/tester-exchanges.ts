// Seeds tester exchanges for future crawler development. No exchange
// websocket connection is needed: pair this data with the dummy worker at
// src/core/crawler/tester-worker.ts, which emits synthetic ticks.
//
// What gets seeded (idempotent, safe to re-run; re-running also re-enables
// anything you suspended/delisted while testing):
// - exchange-tester-a (USDT-quoted) and exchange-tester-b (IDR-quoted),
//   so both sides of the pipeline's IDR conversion are exercisable.
// - Bitcoin (BTC) and Ethereum (ETH) only, reused by cmcId if the coin-data
//   seeder already imported them.
// - BTC on Bitcoin mainnet, ETH on Ethereum mainnet, withdraw+deposit on.
// - listed + tradeEnabled on, so both coins are eligible on both exchanges.
//
// Usage:
//   bun run db:seed:tester   # aka: bun run src/seed/tester-exchanges.ts
//
// Dev-test loop afterwards:
//   1. Drive src/core/crawler/supervisor.ts with the tester worker script
//      (or the worker.control endpoint once the reconciler is wired in
//      src/index.ts) to start exchange-tester-a / exchange-tester-b.
//   2. Watch orderbook_snapshot rows appear per (exchange, coin).
//   3. Suspend a chain or delist a mapping via the API and watch the shard
//      unsubscribe; re-run this seeder to restore the eligible state.
import { sql } from "drizzle-orm";
import { database } from "../database/connection";
import { cryptocurrencyTable } from "../core/cryptocurrency/cryptocurrency.sql";
import { exchangeTable } from "../core/exchange/exchange.sql";
import { exchangeCryptocurrencyTable } from "../core/exchange-cryptocurrency/exchange-cryptocurrency.sql";
import { exchangeCryptocurrencyChainTable } from "../core/exchange-cryptocurrency-chain/exchange-cryptocurrency-chain.sql";
import { chainTable } from "../core/chain/chain.sql";
import { getEligibleCoins } from "../core/crawler/eligible-set";

const testerExchanges = [
  {
    slug: "exchange-tester-a",
    name: "Exchange Tester A",
    cmcId: 910001,
    logo: "",
    baseCurrency: "usdt" as const,
    symbols: { BTC: "BTCUSDT", ETH: "ETHUSDT" },
  },
  {
    slug: "exchange-tester-b",
    name: "Exchange Tester B",
    cmcId: 910002,
    logo: "",
    baseCurrency: "idr" as const,
    symbols: { BTC: "BTCIDR", ETH: "ETHIDR" },
  },
];

const testerCoins = [
  { cmcId: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin", logo: "" },
  { cmcId: 1027, name: "Ethereum", symbol: "ETH", slug: "ethereum", logo: "" },
];

const testerChains = [
  { code: "BTC", name: "Bitcoin" },
  { code: "ETH", name: "Ethereum" },
];

// Coin symbol -> mainnet chain code.
const coinChain: Record<string, string> = { BTC: "BTC", ETH: "ETH" };

export async function seedTesterExchanges() {
  const exchangeIds = new Map<string, number>();
  await database.transaction(async (tx) => {
    const importedCoins = await tx
      .insert(cryptocurrencyTable)
      .values(testerCoins)
      .onConflictDoUpdate({
        target: cryptocurrencyTable.cmcId,
        set: {
          name: sql`excluded.name`,
          symbol: sql`excluded.symbol`,
          slug: sql`excluded.slug`,
          logo: sql`excluded.logo`,
        },
      })
      .returning({ id: cryptocurrencyTable.id, symbol: cryptocurrencyTable.symbol });
    const importedExchanges = await tx
      .insert(exchangeTable)
      .values(
        testerExchanges.map(({ symbols: _symbols, ...exchange }) => exchange),
      )
      .onConflictDoUpdate({
        target: exchangeTable.slug,
        set: {
          cmcId: sql`excluded."cmcId"`,
          name: sql`excluded.name`,
          logo: sql`excluded.logo`,
          baseCurrency: sql`excluded."baseCurrency"`,
        },
      })
      .returning({ id: exchangeTable.id, slug: exchangeTable.slug });
    const importedChains = await tx
      .insert(chainTable)
      .values(testerChains)
      .onConflictDoUpdate({
        target: chainTable.code,
        set: { name: sql`excluded.name` },
      })
      .returning({ id: chainTable.id, code: chainTable.code });

    const coinsBySymbol = new Map(importedCoins.map((coin) => [coin.symbol, coin.id]));
    const exchangesBySlug = new Map(
      importedExchanges.map((exchange) => [exchange.slug, exchange.id]),
    );
    const chainsByCode = new Map(importedChains.map((chain) => [chain.code, chain.id]));

    const mappingRows = testerExchanges.flatMap((exchange) => {
      const exchangeId = exchangesBySlug.get(exchange.slug);
      return (Object.keys(exchange.symbols) as Array<keyof typeof exchange.symbols>).flatMap(
        (symbol) => {
          const cryptocurrencyId = coinsBySymbol.get(symbol);
          return exchangeId !== undefined && cryptocurrencyId !== undefined
            ? [
                {
                  exchangeId,
                  cryptocurrencyId,
                  exchangeSymbol: exchange.symbols[symbol],
                  listed: true,
                  tradeEnabled: true,
                },
              ]
            : [];
        },
      );
    });
    const importedMappings = await tx
      .insert(exchangeCryptocurrencyTable)
      .values(mappingRows)
      .onConflictDoUpdate({
        target: [
          exchangeCryptocurrencyTable.exchangeId,
          exchangeCryptocurrencyTable.cryptocurrencyId,
        ],
        set: {
          exchangeSymbol: sql`excluded."exchangeSymbol"`,
          listed: true,
          tradeEnabled: true,
        },
      })
      .returning({
        id: exchangeCryptocurrencyTable.id,
        exchangeId: exchangeCryptocurrencyTable.exchangeId,
        cryptocurrencyId: exchangeCryptocurrencyTable.cryptocurrencyId,
      });

    // Resolve (exchangeId, cryptocurrencyId) -> symbol for chain linking.
    const symbolByCryptoId = new Map(
      importedCoins.map((coin) => [coin.id, coin.symbol]),
    );
    const linkRows = importedMappings.flatMap((mapping) => {
      const symbol = symbolByCryptoId.get(mapping.cryptocurrencyId);
      const chainCode = symbol ? coinChain[symbol] : undefined;
      const chainId = chainCode ? chainsByCode.get(chainCode) : undefined;
      return chainId !== undefined
        ? [
            {
              exchangeCryptocurrencyId: mapping.id,
              chainId,
              exchangeChainCode: chainCode as string,
              withdrawEnabled: true,
              depositEnabled: true,
            },
          ]
        : [];
    });
    if (linkRows.length > 0) {
      await tx
        .insert(exchangeCryptocurrencyChainTable)
        .values(linkRows)
        .onConflictDoUpdate({
          target: [
            exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
            exchangeCryptocurrencyChainTable.chainId,
          ],
          set: {
            exchangeChainCode: sql`excluded."exchangeChainCode"`,
            withdrawEnabled: true,
            depositEnabled: true,
          },
        });
    }

    for (const [slug, id] of exchangesBySlug) exchangeIds.set(slug, id);
  });

  const eligibility: Record<string, number> = {};
  for (const [slug, id] of exchangeIds) {
    eligibility[slug] = (await getEligibleCoins(id)).length;
  }
  return {
    exchanges: testerExchanges.length,
    coins: testerCoins.length,
    mappings: testerExchanges.length * testerCoins.length,
    eligibility,
  };
}

if (import.meta.main) {
  const result = await seedTesterExchanges();
  console.info(
    `Seeded ${result.exchanges} tester exchanges, ${result.coins} coins, ${result.mappings} mappings.`,
  );
  for (const [slug, count] of Object.entries(result.eligibility)) {
    console.info(`Eligible on ${slug}: ${count} coins.`);
  }
  await database.$client.end();
}
