import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "../database/connection";
import { cryptocurrencyTable } from "../core/cryptocurrency/cryptocurrency.sql";
import { exchangeTable } from "../core/exchange/exchange.sql";
import { exchangeCryptocurrencyTable } from "../core/exchange-cryptocurrency/exchange-cryptocurrency.sql";

const coinSchema = z.object({
  cmcId: z.number().int().positive(),
  name: z.string().min(1),
  symbol: z.string().min(1),
  slug: z.string().min(1),
  logo: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  indodax: z.boolean().nullish(),
  gateio: z.boolean().nullish(),
  kucoin: z.boolean().nullish(),
  mexc: z.boolean().nullish(),
  bitget: z.boolean().nullish(),
  binance: z.boolean().nullish(),
  htx: z.boolean().nullish(),
  huobi: z.boolean().nullish(),
  bybit: z.boolean().nullish(),
  indodaxAlternateSymbol: z.string().nullish(),
  gateioAlternateSymbol: z.string().nullish(),
  kucoinAlternateSymbol: z.string().nullish(),
  mexcAlternateSymbol: z.string().nullish(),
  bitgetAlternateSymbol: z.string().nullish(),
  binanceAlternateSymbol: z.string().nullish(),
  htxAlternateSymbol: z.string().nullish(),
  huobiAlternateSymbol: z.string().nullish(),
  bybitAlternateSymbol: z.string().nullish(),
});

export const coinDataSchema = z.array(coinSchema);
export type CoinData = z.infer<typeof coinDataSchema>;

export const supportedExchanges = [
  {
    key: "indodax",
    name: "Indodax",
    slug: "indodax",
    cmcId: 900001,
    baseCurrency: "idr" as const,
  },
  {
    key: "gateio",
    name: "Gate.io",
    slug: "gateio",
    cmcId: 302,
    baseCurrency: "usdt" as const,
  },
  {
    key: "kucoin",
    name: "KuCoin",
    slug: "kucoin",
    cmcId: 311,
    baseCurrency: "usdt" as const,
  },
  {
    key: "mexc",
    name: "MEXC",
    slug: "mexc",
    cmcId: 544,
    baseCurrency: "usdt" as const,
  },
  {
    key: "bitget",
    name: "Bitget",
    slug: "bitget",
    cmcId: 513,
    baseCurrency: "usdt" as const,
  },
  {
    key: "binance",
    name: "Binance",
    slug: "binance",
    cmcId: 270,
    baseCurrency: "usdt" as const,
  },
  {
    key: "htx",
    name: "HTX (Huobi)",
    slug: "htx",
    cmcId: 102,
    baseCurrency: "usdt" as const,
  },
  {
    key: "bybit",
    name: "Bybit",
    slug: "bybit",
    cmcId: 521,
    baseCurrency: "usdt" as const,
  },
] as const;

type ExchangeKey = (typeof supportedExchanges)[number]["key"];
type MappableCoin = CoinData[number];

export type CoinImportPlan = {
  coins: Array<typeof cryptocurrencyTable.$inferInsert>;
  exchanges: Array<typeof exchangeTable.$inferInsert>;
  assignments: Array<{
    exchangeKey: ExchangeKey;
    cmcId: number;
    exchangeSymbol: string;
  }>;
};

export type CoinDataInput =
  z.input<typeof coinDataSchema> | { data: z.input<typeof coinDataSchema> };
export function parseCoinData(input: CoinDataInput): CoinData {
  const value = Array.isArray(input)
    ? input
    : z.object({ data: coinDataSchema }).parse(input).data;
  return coinDataSchema.parse(value);
}

export function mapCoinData(input: CoinDataInput): CoinImportPlan {
  const coins = parseCoinData(input);
  const uniqueCoins = [
    ...new Map(coins.map((coin) => [coin.cmcId, coin])).values(),
  ];
  const exchanges = supportedExchanges.map((exchange) => ({
    cmcId: exchange.cmcId,
    name: exchange.name,
    slug: exchange.slug,
    logo: "",
    baseCurrency: exchange.baseCurrency,
  }));
  const assignments: CoinImportPlan["assignments"] = [];

  // SAFETY: uniqueCoins is constructed directly from validated CoinData.
  for (const coin of uniqueCoins as MappableCoin[]) {
    for (const exchange of supportedExchanges) {
      const enabled =
        coin[exchange.key] === true ||
        (exchange.key === "htx" && coin.huobi === true);
      if (!enabled) continue;
      const alternate =
        coin[`${exchange.key}AlternateSymbol`] ??
        (exchange.key === "htx" ? coin.huobiAlternateSymbol : undefined);
      assignments.push({
        exchangeKey: exchange.key,
        cmcId: coin.cmcId,
        exchangeSymbol: alternate ?? coin.symbol,
      });
    }
  }

  return {
    coins: uniqueCoins.map(({ cmcId, name, symbol, slug, logo }) => ({
      cmcId,
      name,
      symbol,
      slug,
      logo,
    })),
    exchanges,
    assignments,
  };
}

export async function importCoinData(input: CoinDataInput) {
  const plan = mapCoinData(input);
  await database.transaction(async (tx) => {
    const importedCoins = await tx
      .insert(cryptocurrencyTable)
      .values(plan.coins)
      .onConflictDoUpdate({
        target: cryptocurrencyTable.cmcId,
        set: {
          name: sql`excluded.name`,
          symbol: sql`excluded.symbol`,
          slug: sql`excluded.slug`,
          logo: sql`excluded.logo`,
        },
      })
      .returning({
        id: cryptocurrencyTable.id,
        cmcId: cryptocurrencyTable.cmcId,
      });
    const importedExchanges = await tx
      .insert(exchangeTable)
      .values(plan.exchanges)
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
    const coinsByCmcId = new Map(
      importedCoins.map((coin) => [coin.cmcId, coin.id]),
    );
    const exchangesByKey = new Map(
      importedExchanges.map((exchange) => [exchange.slug, exchange.id]),
    );
    const assignmentRows = plan.assignments.flatMap((assignment) => {
      const cryptocurrencyId = coinsByCmcId.get(assignment.cmcId);
      const exchangeId = exchangesByKey.get(assignment.exchangeKey);
      return cryptocurrencyId && exchangeId
        ? [
            {
              exchangeId,
              cryptocurrencyId,
              exchangeSymbol: assignment.exchangeSymbol,
            },
          ]
        : [];
    });
    if (assignmentRows.length > 0) {
      await tx
        .insert(exchangeCryptocurrencyTable)
        .values(assignmentRows)
        .onConflictDoUpdate({
          target: [
            exchangeCryptocurrencyTable.exchangeId,
            exchangeCryptocurrencyTable.cryptocurrencyId,
          ],
          set: { exchangeSymbol: sql`excluded."exchangeSymbol"` },
        });
    }
  });
  return {
    cryptocurrencies: plan.coins.length,
    exchanges: plan.exchanges.length,
    assignments: plan.assignments.length,
  };
}

if (import.meta.main) {
  const sourcePath = Bun.argv[2] ?? "/tmp/arbitrator-cmc-result.json";
  const raw = JSON.parse(await readFile(sourcePath, "utf8"));
  const result = await importCoinData(raw);
  console.info(
    `Imported ${result.cryptocurrencies} cryptocurrencies, ${result.exchanges} exchanges, and ${result.assignments} assignments.`,
  );
  await database.$client.end();
}
