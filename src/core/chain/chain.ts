import { eq, count, or, ilike, and, asc, desc, SQL } from "drizzle-orm";
import { getDatabase } from "../../database/connection";
import { chainTable } from "./chain.sql";
import type { ListChainInput } from "./chain.type";

export namespace Chain {
  export async function add(chain: typeof chainTable.$inferInsert) {
    return await getDatabase()
      .insert(chainTable)
      .values(chain)
      .returning()
      .then((result) => result.at(0));
  }

  export async function list(input: ListChainInput) {
    const conditions: SQL<unknown>[] = [];

    if (input?.search) {
      const condition = or(
        ilike(
          chainTable[input.searchBy],
          "%" + input.search.toLowerCase() + "%",
        ),
      );
      if (condition) conditions.push(condition);
    }
    const total = await getDatabase()
      .select({ count: count() })
      .from(chainTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .then((result) => result.at(0)?.count ?? 0);
    const pages = input.limit === -1 ? 1 : Math.ceil(total / input.limit);
    const dataQuery = getDatabase()
      .select()
      .from(chainTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        input.order === "asc"
          ? asc(chainTable[input.orderBy])
          : desc(chainTable[input.orderBy]),
      );
    const data =
      input.limit === -1
        ? await dataQuery
        : await dataQuery.limit(input.limit).offset((input.page - 1) * input.limit);
    return {
      data,
      meta: {
        items: total,
        pages,
        page: input.page,
        limit: input.limit,
        from: total ? (input.page - 1) * input.limit + 1 : 0,
        to: input.limit === -1 ? total : Math.min(input.page * input.limit, total),
        hasNextPage: input.page < pages,
        hasPreviousPage: input.page > 1,
        search: input.search,
        searchBy: input.searchBy,
        order: input.order,
        orderBy: input.orderBy,
      },
    };
  }

  export async function codeExists(code: string) {
    return await getDatabase()
      .select({ count: count() })
      .from(chainTable)
      .where(eq(chainTable.code, code))
      .then((result) => !!result.at(0)?.count);
  }

  export async function getById(id: number) {
    return await getDatabase()
      .select()
      .from(chainTable)
      .where(eq(chainTable.id, id))
      .then((result) => result.at(0));
  }

  export async function getByCode(code: string) {
    return await getDatabase()
      .select()
      .from(chainTable)
      .where(eq(chainTable.code, code))
      .then((result) => result.at(0));
  }

  export async function update(
    id: number,
    chain: Partial<typeof chainTable.$inferInsert>,
  ) {
    return await getDatabase()
      .update(chainTable)
      .set(chain)
      .where(eq(chainTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }

  export async function remove(id: number) {
    return await getDatabase()
      .delete(chainTable)
      .where(eq(chainTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }
}
