import { and, count, eq } from "drizzle-orm";
import { exchangeCryptocurrencyChainTable } from "./exchange-cryptocurrency-chain.sql";
import { database } from "../../database/connection";
import type {
  ExchangeCryptocurrencyChainFilterExists,
  ExchangeCryptocurrencyChainInsert,
  ExchangeCryptocurrencyChainUpdate,
} from "./exchange-cryptocurrency-chain.schema";

export namespace ExchangeCryptocurrencyChain {
  export type FindAllFilter = {
    exchangeCryptocurrencyId?: number;
    chainId?: number;
  };

  export async function getAll(filter?: FindAllFilter) {
    const conditions = [];
    if (filter?.exchangeCryptocurrencyId !== undefined) {
      conditions.push(
        eq(
          exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
          filter.exchangeCryptocurrencyId,
        ),
      );
    }
    if (filter?.chainId !== undefined) {
      conditions.push(
        eq(exchangeCryptocurrencyChainTable.chainId, filter.chainId),
      );
    }

    return await database
      .select()
      .from(exchangeCryptocurrencyChainTable)
      .where(conditions?.length ? and(...conditions) : undefined);
  }

  export async function getById(id: number) {
    return await database
      .select()
      .from(exchangeCryptocurrencyChainTable)
      .where(eq(exchangeCryptocurrencyChainTable.id, id))
      .then((result) => result.at(0));
  }

  export async function exists(
    filter: ExchangeCryptocurrencyChainFilterExists,
  ): Promise<boolean> {
    const result = await database
      .select({ count: count() })
      .from(exchangeCryptocurrencyChainTable)
      .where(
        and(
          eq(
            exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
            filter.exchangeCryptocurrencyId,
          ),
          eq(exchangeCryptocurrencyChainTable.chainId, filter.chainId),
        ),
      )
      .execute();

    return !!result[0]?.count;
  }

  export async function add(
    exchangeCryptocurrencyChain: ExchangeCryptocurrencyChainInsert,
  ) {
    return await database
      .insert(exchangeCryptocurrencyChainTable)
      .values(exchangeCryptocurrencyChain)
      .returning()
      .then((result) => result[0]);
  }

  export async function update(
    id: number,
    exchangeCryptocurrencyChain: ExchangeCryptocurrencyChainUpdate,
  ) {
    return await database
      .update(exchangeCryptocurrencyChainTable)
      .set(exchangeCryptocurrencyChain)
      .where(eq(exchangeCryptocurrencyChainTable.id, id))
      .returning()
      .then((result) => result[0]);
  }

  export async function remove(id: number) {
    return await database
      .delete(exchangeCryptocurrencyChainTable)
      .where(eq(exchangeCryptocurrencyChainTable.id, id))
      .returning()
      .then((result) => result[0]);
  }
}
