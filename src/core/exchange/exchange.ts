import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { database } from "../../database/connection";
import { exchangeTable } from "./exchange.sql";
import type {
  ExchangeInsert,
  ListExchangeInput,
  PaginatedExchangeList,
} from "./exchange.type";

export namespace Exchange {
  export async function add(exchange: ExchangeInsert) {
    return await database
      .insert(exchangeTable)
      .values(exchange)
      .returning()
      .then((result) => result.at(0));
  }

  export async function list(
    input: ListExchangeInput,
  ): Promise<PaginatedExchangeList> {
    const conditions: (SQL | undefined)[] = [];

    if (input?.search) {
      // handle number type search, we need to cast this
      if (input.searchBy === "id" || input.searchBy === "cmcId") {
        const numericSearch = Number(input.search);
        conditions.push(
          eq(exchangeTable[input.searchBy], Number.isNaN(numericSearch) ? -1 : numericSearch),
        );
      } else {
        // if it's string we just do normal ilike
        const condition = or(
          ilike(
            exchangeTable[input.searchBy],
            "%" + input.search.toLowerCase() + "%",
          ),
        );
        if (condition) conditions.push(condition);
      }
    }

    const { page, limit } = input;
    if (limit === -1) {
      const items = await database
        .select({ count: count() })
        .from(exchangeTable)
        .where(conditions?.length ? and(...conditions) : undefined)
        .then((result) => result?.at(0)?.count || 0);

      const pages = 1;
      const from = items ? 1 : 0;
      const to = items;

      return {
        data: await database
          .select()
          .from(exchangeTable)
          .where(conditions?.length ? and(...conditions) : undefined)
          .orderBy(
            input.order === "asc"
              ? asc(exchangeTable[input.orderBy])
              : desc(exchangeTable[input.orderBy]),
          ),
        meta: {
          order: input.order,
          orderBy: input.orderBy,
          search: input.search,
          searchBy: input.searchBy,
          from,
          to,
          items,
          pages,
          page,
          limit,
          hasNextPage: page < pages,
          hasPreviousPage: page > 1,
        },
      };
    }

    // Get total count
    const totalResult = await database
      .select({ count: count() })
      .from(exchangeTable)
      .where(conditions?.length ? and(...conditions) : undefined);

    const offset = (page - 1) * limit;
    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);

    // Get paginated data
    const data = await database
      .select()
      .from(exchangeTable)
      .where(conditions?.length ? and(...conditions) : undefined)
      .limit(limit)
      .orderBy(
        input.order === "asc"
          ? asc(exchangeTable[input.orderBy])
          : desc(exchangeTable[input.orderBy]),
      )
      .offset(offset);

    return {
      data,
      meta: {
        items: total,
        pages: pages,
        page: page,
        limit,
        from,
        to,
        hasNextPage: page < pages,
        hasPreviousPage: page > 1,
        order: input.order,
        orderBy: input.orderBy,
        search: input.search,
        searchBy: input.searchBy,
      },
    };
  }

  export async function cmcIdExists(cmcId: number) {
    return await database
      .select({ count: count() })
      .from(exchangeTable)
      .where(eq(exchangeTable.cmcId, cmcId))
      .then((result) => !!result.at(0)?.count);
  }

  export async function getById(id: number) {
    return await database
      .select()
      .from(exchangeTable)
      .where(eq(exchangeTable.id, id))
      .then((result) => result.at(0));
  }

  export async function getByCmcId(cmcId: number) {
    return await database
      .select()
      .from(exchangeTable)
      .where(eq(exchangeTable.cmcId, cmcId))
      .then((result) => result.at(0));
  }

  export async function getBySlug(slug: string) {
    return await database
      .select()
      .from(exchangeTable)
      .where(eq(exchangeTable.slug, slug))
      .then((result) => result.at(0));
  }

  export async function update(
    id: number,
    exchange: Partial<typeof exchangeTable.$inferInsert>,
  ) {
    return await database
      .update(exchangeTable)
      .set(exchange)
      .where(eq(exchangeTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }

  export async function remove(id: number) {
    return await database
      .delete(exchangeTable)
      .where(eq(exchangeTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }
}
