import { and, count, eq } from "drizzle-orm";
import { exchangeCryptocurrencyTable } from "./exchange-cryptocurrency.sql";
import { database } from "../../database/connection";
import type {
  ExchangeCryptocurrencyFilterExists,
  ExchangeCryptocurrencySelect,
} from "./exchange-cryptocurrency.schema";

export namespace ExchangeCryptocurrency {
  export async function exists(
    filter: ExchangeCryptocurrencyFilterExists,
  ): Promise<boolean> {
    const result = await database
      .select({ count: count() })
      .from(exchangeCryptocurrencyTable)
      .where(
        and(
          eq(exchangeCryptocurrencyTable.exchangeId, filter.exchangeId),
          eq(
            exchangeCryptocurrencyTable.cryptocurrencyId,
            filter.cryptocurrencyId,
          ),
        ),
      )
      .execute();

    return !!result[0]?.count;
  }

  export async function getAll(filter?: {
    exchangeId?: number;
    cryptocurrencyId?: number;
  }): Promise<ExchangeCryptocurrencySelect[]> {
    if (filter) {
      const conditions = [];
      if (filter.exchangeId !== undefined) {
        conditions.push(
          eq(exchangeCryptocurrencyTable.exchangeId, filter.exchangeId),
        );
      }
      if (filter.cryptocurrencyId !== undefined) {
        conditions.push(
          eq(
            exchangeCryptocurrencyTable.cryptocurrencyId,
            filter.cryptocurrencyId,
          ),
        );
      }
      if (conditions.length > 0) {
        return await database
          .select()
          .from(exchangeCryptocurrencyTable)
          .where(and(...conditions))
          .execute();
      }
    }

    return await database.select().from(exchangeCryptocurrencyTable).execute();
  }

  export async function getById(
    id: number,
  ): Promise<ExchangeCryptocurrencySelect | undefined> {
    const result = await database
      .select()
      .from(exchangeCryptocurrencyTable)
      .where(eq(exchangeCryptocurrencyTable.id, id))
      .limit(1)
      .execute();

    return result[0];
  }

  export async function update(
    id: number,
    payload: Partial<ExchangeCryptocurrencySelect>,
  ) {
    return await database
      .update(exchangeCryptocurrencyTable)
      .set(payload)
      .where(eq(exchangeCryptocurrencyTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }

  export async function countExchangeCryptocurrencies(exchangeId: number) {
    const result = await database
      .select({ count: count() })
      .from(exchangeCryptocurrencyTable)
      .where(eq(exchangeCryptocurrencyTable.exchangeId, exchangeId))
      .execute();

    return result[0]!.count;
  }
}
