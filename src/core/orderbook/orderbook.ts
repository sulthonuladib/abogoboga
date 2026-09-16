import { eq } from "drizzle-orm";
import { database } from "../../database/connection";
import { orderbookSnapshotTable } from "./orderbook.sql";
import type {
  OrderbookSnapshotInsert,
  OrderbookSnapshotSelect,
} from "./orderbook.schema";

export namespace OrderbookSnapshot {
  export async function upsert(
    input: OrderbookSnapshotInsert,
    db: typeof database = database,
  ): Promise<OrderbookSnapshotSelect> {
    const rows = await db
      .insert(orderbookSnapshotTable)
      .values(input)
      .onConflictDoUpdate({
        target: orderbookSnapshotTable.exchangeCryptocurrencyId,
        set: {
          exchangeId: input.exchangeId,
          buyPrice: input.buyPrice,
          sellPrice: input.sellPrice,
          buyAmount: input.buyAmount,
          sellAmount: input.sellAmount,
          tickTimestamp: input.tickTimestamp,
        },
      })
      .returning()
      .execute();
    const row = rows.at(0);
    if (!row) throw new Error("orderbook snapshot upsert returned no row");
    return row;
  }

  export async function getByMappingId(
    exchangeCryptocurrencyId: number,
    db: typeof database = database,
  ): Promise<OrderbookSnapshotSelect | undefined> {
    const rows = await db
      .select()
      .from(orderbookSnapshotTable)
      .where(
        eq(
          orderbookSnapshotTable.exchangeCryptocurrencyId,
          exchangeCryptocurrencyId,
        ),
      )
      .limit(1)
      .execute();
    return rows[0];
  }
}
