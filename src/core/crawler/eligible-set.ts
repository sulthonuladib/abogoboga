import { and, eq } from "drizzle-orm";
import { database } from "../../database/connection";
import { cryptocurrencyTable } from "../cryptocurrency/cryptocurrency.sql";
import { exchangeCryptocurrencyChainTable } from "../exchange-cryptocurrency-chain/exchange-cryptocurrency-chain.sql";
import { exchangeCryptocurrencyTable } from "../exchange-cryptocurrency/exchange-cryptocurrency.sql";

export type EligibleCoin = {
  exchangeCryptocurrencyId: number;
  exchangeId: number;
  cryptocurrencyId: number;
  exchangeSymbol: string;
  symbol: string;
  cmcId: number;
};

type MappingFlags = { listed: boolean; tradeEnabled: boolean };
type ChainFlags = { withdrawEnabled: boolean; depositEnabled: boolean };

// Pure gate for unit tests: listed AND tradeEnabled AND >=1 fully-enabled chain.
export function isEligibleCoin(mapping: MappingFlags, chains: ChainFlags[]): boolean {
  if (!mapping.listed || !mapping.tradeEnabled) return false;
  return chains.some((c) => c.withdrawEnabled && c.depositEnabled);
}

// DB-backed eligible set per exchange. Recomputed from the database on every
// event; callers MUST NOT trust subscription state carried in event payloads.
export async function getEligibleCoins(
  exchangeId: number,
  db: typeof database = database,
): Promise<EligibleCoin[]> {
  const rows = await db
    .selectDistinct({
      exchangeCryptocurrencyId: exchangeCryptocurrencyTable.id,
      exchangeId: exchangeCryptocurrencyTable.exchangeId,
      cryptocurrencyId: exchangeCryptocurrencyTable.cryptocurrencyId,
      exchangeSymbol: exchangeCryptocurrencyTable.exchangeSymbol,
      symbol: cryptocurrencyTable.symbol,
      cmcId: cryptocurrencyTable.cmcId,
    })
    .from(exchangeCryptocurrencyTable)
    .innerJoin(
      exchangeCryptocurrencyChainTable,
      and(
        eq(
          exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
          exchangeCryptocurrencyTable.id,
        ),
        eq(exchangeCryptocurrencyChainTable.withdrawEnabled, true),
        eq(exchangeCryptocurrencyChainTable.depositEnabled, true),
      ),
    )
    .innerJoin(
      cryptocurrencyTable,
      eq(cryptocurrencyTable.id, exchangeCryptocurrencyTable.cryptocurrencyId),
    )
    .where(
      and(
        eq(exchangeCryptocurrencyTable.exchangeId, exchangeId),
        eq(exchangeCryptocurrencyTable.listed, true),
        eq(exchangeCryptocurrencyTable.tradeEnabled, true),
      ),
    )
    .execute();
  return rows;
}
