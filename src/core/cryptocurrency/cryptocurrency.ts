import { and, desc, asc, count, eq, or, ilike, type SQL } from "drizzle-orm";
import { cryptocurrencyTable } from "./cryptocurrency.sql";
import { database } from "../../database/connection";
import type z from "zod";
import {
  cryptocurrencyInsertSchema,
  cryptocurrencyUpdateSchema,
} from "./cryptocurrency.schema";
import { exchangeCryptocurrencyTable } from "../exchange-cryptocurrency/exchange-cryptocurrency.sql";
import { exchangeCryptocurrencyChainTable } from "../exchange-cryptocurrency-chain/exchange-cryptocurrency-chain.sql";
import { exchangeTable } from "../exchange/exchange.sql";
import { chainTable } from "../chain/chain.sql";
import type {
  ListCryptocurrencyInput,
  ListingStatsInput,
  PaginatedCryptocurrencyList,
  PaginatedListingStats,
} from "./cryptocurrency.type";

export namespace Cryptocurrency {
  export async function list(
    input: ListCryptocurrencyInput,
  ): Promise<PaginatedCryptocurrencyList> {
    const conditions: SQL<unknown>[] = [];

    if (input?.search) {
      // handle number type search, we need to cast this
      if (input.searchBy === "id" || input.searchBy === "cmcId") {
        const numericSearch = Number(input.search);
        conditions.push(
          eq(cryptocurrencyTable[input.searchBy], Number.isNaN(numericSearch) ? -1 : numericSearch),
        );
      } else {
        // if it's string we just do normal ilike
        const condition = or(
          ilike(
            cryptocurrencyTable[input.searchBy],
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
        .from(cryptocurrencyTable)
        .where(conditions?.length ? and(...conditions) : undefined)
        .then((result) => result?.at(0)?.count || 0);

      const pages = 1;
      const from = items ? 1 : 0;
      const to = items;

      return {
        data: await database
          .select()
          .from(cryptocurrencyTable)
          .where(conditions?.length ? and(...conditions) : undefined)
          .orderBy(
            input.order === "asc"
              ? asc(cryptocurrencyTable[input.orderBy])
              : desc(cryptocurrencyTable[input.orderBy]),
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
      .from(cryptocurrencyTable)
      .where(conditions?.length ? and(...conditions) : undefined);

    const offset = (page - 1) * limit;
    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);

    // Get paginated data
    const data = await database
      .select()
      .from(cryptocurrencyTable)
      .where(conditions?.length ? and(...conditions) : undefined)
      .limit(limit)
      .orderBy(
        input.order === "asc"
          ? asc(cryptocurrencyTable[input.orderBy])
          : desc(cryptocurrencyTable[input.orderBy]),
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

  export async function getById(id: number) {
    return await database
      .select()
      .from(cryptocurrencyTable)
      .where(eq(cryptocurrencyTable.id, id))
      .then((result) => result.at(0));
  }

  export async function getByCmcId(cmcId: number) {
    return await database
      .select()
      .from(cryptocurrencyTable)
      .where(eq(cryptocurrencyTable.cmcId, cmcId))
      .then((result) => result[0]);
  }

  export async function getBySlug(slug: string) {
    return await database
      .select()
      .from(cryptocurrencyTable)
      .where(eq(cryptocurrencyTable.slug, slug))
      .then((result) => result.at(0));
  }

  export async function getMetadata(input: { id: number } | { slug: string }) {
    const cryptocurrency = "id" in input
      ? await getById(input.id)
      : await getBySlug(input.slug);
    if (!cryptocurrency) return undefined;

    const rows = await database
      .select({
        exchangeId: exchangeTable.id,
        exchangeName: exchangeTable.name,
        exchangeSlug: exchangeTable.slug,
        exchangeSymbol: exchangeCryptocurrencyTable.exchangeSymbol,
        chainId: chainTable.id,
        chainName: chainTable.name,
        chainCode: chainTable.code,
        exchangeChainCode: exchangeCryptocurrencyChainTable.exchangeChainCode,
        exchangeChainName: exchangeCryptocurrencyChainTable.exchangeChainName,
        withdrawEnabled: exchangeCryptocurrencyChainTable.withdrawEnabled,
        depositEnabled: exchangeCryptocurrencyChainTable.depositEnabled,
      })
      .from(exchangeCryptocurrencyTable)
      .innerJoin(
        exchangeTable,
        eq(exchangeTable.id, exchangeCryptocurrencyTable.exchangeId),
      )
      .leftJoin(
        exchangeCryptocurrencyChainTable,
        eq(
          exchangeCryptocurrencyChainTable.exchangeCryptocurrencyId,
          exchangeCryptocurrencyTable.id,
        ),
      )
      .leftJoin(chainTable, eq(chainTable.id, exchangeCryptocurrencyChainTable.chainId))
      .where(eq(exchangeCryptocurrencyTable.cryptocurrencyId, cryptocurrency.id));

    const exchanges = new Map<number, {
      id: number;
      name: string;
      slug: string;
      symbol: string;
      chains: Array<{
        id: number;
        name: string;
        code: string;
        exchangeChainCode: string;
        exchangeChainName: string | null;
        withdrawEnabled: boolean;
        depositEnabled: boolean;
      }>;
    }>();
    for (const row of rows) {
      const exchange = exchanges.get(row.exchangeId) ?? {
        id: row.exchangeId,
        name: row.exchangeName,
        slug: row.exchangeSlug,
        symbol: row.exchangeSymbol,
        chains: [],
      };
      if (
        row.chainId !== null &&
        row.chainName !== null &&
        row.chainCode !== null &&
        row.exchangeChainCode !== null &&
        row.withdrawEnabled !== null &&
        row.depositEnabled !== null
      ) exchange.chains.push({
        id: row.chainId,
        name: row.chainName,
        code: row.chainCode,
        exchangeChainCode: row.exchangeChainCode,
        exchangeChainName: row.exchangeChainName,
        withdrawEnabled: row.withdrawEnabled,
        depositEnabled: row.depositEnabled,
      });
      exchanges.set(row.exchangeId, exchange);
    }
    return { ...cryptocurrency, exchanges: [...exchanges.values()] };
  }

  export async function cmcIdExists(cmcId: number) {
    return await database
      .select({ count: count() })
      .from(cryptocurrencyTable)
      .where(eq(cryptocurrencyTable.cmcId, cmcId))
      .then((result) => !!result.at(0)?.count);
  }

  export async function add(
    cryptocurrency: z.infer<typeof cryptocurrencyInsertSchema>,
  ) {
    return await database
      .insert(cryptocurrencyTable)
      .values(cryptocurrency)
      .returning()
      .then((result) => result.at(0));
  }

  export async function update(
    id: number,
    cryptocurrency: z.infer<typeof cryptocurrencyUpdateSchema>,
  ) {
    return await database
      .update(cryptocurrencyTable)
      .set(cryptocurrency)
      .where(eq(cryptocurrencyTable.id, id))
      .returning()
      .then((result) => result.at(0));
  }

  export async function remove(id: number) {
    return await database
      .delete(cryptocurrencyTable)
      .where(eq(cryptocurrencyTable.id, id))
      .returning()
      .then((result) => result[0]);
  }

  function canTransfer(
    srcLinks: Array<{ chainId: number; withdrawEnabled: boolean }>,
    dstLinks: Array<{ chainId: number; depositEnabled: boolean }>,
  ): boolean {
    const dstDepositByChain = new Map<number, boolean>();
    for (const link of dstLinks) {
      if (link.depositEnabled) dstDepositByChain.set(link.chainId, true);
    }
    for (const src of srcLinks) {
      if (src.withdrawEnabled && dstDepositByChain.get(src.chainId)) return true;
    }
    return false;
  }

  export function countBlockedRoutes(
    marketsLinks: Array<
      Array<{ chainId: number; withdrawEnabled: boolean; depositEnabled: boolean }>
    >,
  ): number {
    if (marketsLinks.length < 2) return 0;
    let blocked = 0;
    for (let i = 0; i < marketsLinks.length; i++) {
      for (let j = 0; j < marketsLinks.length; j++) {
        if (i === j) continue;
        const forward = canTransfer(marketsLinks[i]!, marketsLinks[j]!);
        const backward = canTransfer(marketsLinks[j]!, marketsLinks[i]!);
        // Ordered pair (i -> j) counts as blocked only when the unordered
        // route status is `none`: no shared enabled chain in either direction.
        if (!forward && !backward) blocked += 1;
      }
    }
    return blocked;
  }

  export async function listingStats(
    input: ListingStatsInput,
  ): Promise<PaginatedListingStats> {
    const search = input.search?.trim() ?? "";
    let coins: (typeof cryptocurrencyTable.$inferSelect)[];
    if (search) {
      coins = await database
        .select()
        .from(cryptocurrencyTable)
        .where(
          or(
            ilike(cryptocurrencyTable.symbol, `%${search.toLowerCase()}%`),
            ilike(cryptocurrencyTable.name, `%${search.toLowerCase()}%`),
          ),
        );
    } else {
      coins = await database.select().from(cryptocurrencyTable);
    }

    const allMarkets = await database.select().from(exchangeCryptocurrencyTable);
    const allLinks = await database
      .select()
      .from(exchangeCryptocurrencyChainTable);

    const marketsByCoin = new Map<number, typeof allMarkets>();
    for (const market of allMarkets) {
      const list = marketsByCoin.get(market.cryptocurrencyId) ?? [];
      list.push(market);
      marketsByCoin.set(market.cryptocurrencyId, list);
    }
    const linksByMarket = new Map<number, typeof allLinks>();
    for (const link of allLinks) {
      const list = linksByMarket.get(link.exchangeCryptocurrencyId) ?? [];
      list.push(link);
      linksByMarket.set(link.exchangeCryptocurrencyId, list);
    }

    type Row = (typeof coins)[number] & {
      markets: number;
      chains: number;
      blocked: number;
    };
    let rows: Row[] = coins.map((coin) => {
      const markets = marketsByCoin.get(coin.id) ?? [];
      const marketsLinks = markets.map(
        (market) => linksByMarket.get(market.id) ?? [],
      );
      const distinctChains = new Set<number>();
      for (const links of marketsLinks) {
        for (const link of links) distinctChains.add(link.chainId);
      }
      return {
        ...coin,
        markets: markets.length,
        chains: distinctChains.size,
        blocked: countBlockedRoutes(marketsLinks),
      };
    });

    if (input.exchangeId !== undefined) {
      const wanted = input.exchangeId;
      rows = rows.filter((row) => {
        const markets = marketsByCoin.get(row.id) ?? [];
        return markets.some((market) => market.exchangeId === wanted);
      });
    }
    if (input.chainId !== undefined) {
      const wanted = input.chainId;
      rows = rows.filter((row) => {
        const markets = marketsByCoin.get(row.id) ?? [];
        return markets.some((market) => {
          const links = linksByMarket.get(market.id) ?? [];
          return links.some((link) => link.chainId === wanted);
        });
      });
    }
    if (input.flag === "blocked") {
      rows = rows.filter((row) => row.blocked > 0);
    } else if (input.flag === "single") {
      rows = rows.filter((row) => row.markets <= 1);
    }

    const direction = input.order === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (input.sortBy === "symbol") return a.symbol.localeCompare(b.symbol) * direction;
      return (a[input.sortBy] - b[input.sortBy]) * direction || a.symbol.localeCompare(b.symbol);
    });

    const { page, limit } = input;
    const total = rows.length;
    if (limit === -1) {
      return {
        data: rows,
        meta: {
          items: total,
          pages: 1,
          page,
          limit,
          from: total ? 1 : 0,
          to: total,
          hasNextPage: false,
          hasPreviousPage: page > 1,
          search: input.search,
          searchBy: "symbol",
          order: input.order,
          orderBy: input.sortBy,
        },
      };
    }
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const data = rows.slice(offset, offset + limit);
    return {
      data,
      meta: {
        items: total,
        pages,
        page,
        limit,
        from: total ? offset + 1 : 0,
        to: Math.min(page * limit, total),
        hasNextPage: page < pages,
        hasPreviousPage: page > 1,
        search: input.search,
        searchBy: "symbol",
        order: input.order,
        orderBy: input.sortBy,
      },
    };
  }
}
