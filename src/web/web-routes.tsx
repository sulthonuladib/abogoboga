import { Elysia } from "elysia";
import { html, Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import { htmx } from "elysia-htmx";
import { ORPCError } from "@orpc/server";
import { api } from "./client";
import { wantsFragment, setFragmentHeaders } from "./htmx-helpers";
import { Layout, ErrorFragment } from "./views/layout";
import {
  CoinsPageBody,
  CoinsTable,
  CoinFormFragment,
  type CoinStatsRow,
} from "./views/coins";
import { ExchangesPageBody, ExchangeDetailBody } from "./views/exchanges";
import { ChainsPageBody, ChainDetailBody } from "./views/chains";
import { CoinDrawer, type DrawerMarket } from "./views/drawer";
import {
  RoutesMatrixBody,
  RouteDetailFragment,
  type RouteMatrixCell,
} from "./views/routes-matrix";
import { DashboardBody, type AttentionItem } from "./views/dashboard";
import {
  orderedPairStatus,
  sharedChainIds,
  type ChainLinkFlags,
} from "./transfer";

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ORPCError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "NOT_FOUND";
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    (error.code === "CONFLICT" || error.code === "BAD_REQUEST")
  );
}

async function coinStatsRows(params: {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: string;
  exchangeId?: number;
  chainId?: number;
  flag?: string;
}): Promise<{ rows: CoinStatsRow[]; total: number; page: number; pages: number }> {
  const sortBy =
    params.sortBy === "markets" ||
    params.sortBy === "chains" ||
    params.sortBy === "blocked" ||
    params.sortBy === "symbol"
      ? params.sortBy
      : "symbol";
  const order = params.order === "desc" ? "desc" : "asc";
  const flag =
    params.flag === "blocked" || params.flag === "single" ? params.flag : "all";
  const result = await api.cryptocurrency.stats({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search ?? "",
    exchangeId: params.exchangeId,
    chainId: params.chainId,
    flag,
    sortBy,
    order,
  });
  return {
    rows: result.data.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      slug: row.slug,
      cmcId: row.cmcId,
      logo: row.logo,
      markets: row.markets,
      chains: row.chains,
      blocked: row.blocked,
    })),
    total: result.meta.items,
    page: result.meta.page,
    pages: result.meta.pages,
  };
}

async function buildDrawerMarkets(coinId: number): Promise<DrawerMarket[]> {
  const markets = await api.exchangeCryptocurrency.list({
    cryptocurrencyId: coinId,
  });
  const out: DrawerMarket[] = [];
  for (const market of markets) {
    const exchange = await api.exchange
      .findById({ id: market.exchangeId })
      .catch(() => undefined);
    const links = await api.exchangeCryptocurrencyChain.list({
      exchangeCryptocurrencyId: market.id,
    });
    const chains: DrawerMarket["chains"] = [];
    for (const link of links) {
      const chain = await api.chain
        .findById({ id: link.chainId })
        .catch(() => undefined);
      chains.push({
        linkId: link.id,
        chainId: link.chainId,
        chainName: chain?.name ?? "chain " + String(link.chainId),
        chainCode: chain?.code ?? "?",
        exchangeChainCode: link.exchangeChainCode,
        depositEnabled: link.depositEnabled,
        withdrawEnabled: link.withdrawEnabled,
      });
    }
    out.push({
      marketId: market.id,
      exchangeId: market.exchangeId,
      exchangeName: exchange?.name ?? "exchange " + String(market.exchangeId),
      exchangeSymbol: market.exchangeSymbol,
      listed: market.listed,
      tradeEnabled: market.tradeEnabled,
      chains,
    });
  }
  return out;
}

async function renderDrawer(coinId: number) {
  const coin = await api.cryptocurrency.findById({ id: coinId });
  const markets = await buildDrawerMarkets(coinId);
  const allExchanges = await api.exchange.list({
    page: 1,
    limit: -1,
    search: "",
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
  const allChains = await api.chain.list({
    page: 1,
    limit: -1,
    search: "",
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
  return CoinDrawer({
    coin: { id: coin.id, symbol: coin.symbol, name: coin.name, slug: coin.slug },
    markets,
    exchanges: allExchanges.data.map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
    })),
    chains: allChains.data.map((chain) => ({
      id: chain.id,
      name: chain.name,
      code: chain.code,
    })),
  });
}

async function buildRouteCells(coinId: number): Promise<{
  coin: { id: number; symbol: string; name: string };
  exchanges: Array<{ marketId: number; exchangeName: string }>;
  cells: RouteMatrixCell[];
  linksByMarket: Map<number, ChainLinkFlags[]>;
}> {
  const coin = await api.cryptocurrency.findById({ id: coinId });
  const markets = await buildDrawerMarkets(coinId);
  const linksByMarket = new Map<number, ChainLinkFlags[]>();
  for (const market of markets) {
    linksByMarket.set(
      market.marketId,
      market.chains.map((chain) => ({
        chainId: chain.chainId,
        withdrawEnabled: chain.withdrawEnabled,
        depositEnabled: chain.depositEnabled,
      })),
    );
  }
  const exchanges = markets.map((market) => ({
    marketId: market.marketId,
    exchangeName: market.exchangeName,
  }));
  const cells: RouteMatrixCell[] = [];
  for (const from of markets) {
    for (const to of markets) {
      if (from.marketId === to.marketId) continue;
      const fromLinks = linksByMarket.get(from.marketId) ?? [];
      const toLinks = linksByMarket.get(to.marketId) ?? [];
      cells.push({
        fromMarketId: from.marketId,
        toMarketId: to.marketId,
        fromExchange: from.exchangeName,
        toExchange: to.exchangeName,
        status: orderedPairStatus(fromLinks, toLinks),
      });
    }
  }
  return {
    coin: { id: coin.id, symbol: coin.symbol, name: coin.name },
    exchanges,
    cells,
    linksByMarket,
  };
}

export const webApp = new Elysia()
  .use(html())
  .use(htmx())
  .get("/", ({ redirect }) => redirect("/dashboard", 302))
  .get("/dashboard", async ({ hx, set }) => {
    const [coinStats, exchangeList, chainList, markets] = await Promise.all([
      api.cryptocurrency.stats({ page: 1, limit: 1, search: "", flag: "all", sortBy: "symbol", order: "asc" }),
      api.exchange.list({ page: 1, limit: 1, search: "", searchBy: "name", orderBy: "id", order: "asc" }),
      api.chain.list({ page: 1, limit: 1, search: "", searchBy: "name", orderBy: "id", order: "asc" }),
      api.exchangeCryptocurrency.list(),
    ]);
    const links = await api.exchangeCryptocurrencyChain.list();
    const fullStats = await api.cryptocurrency.stats({
      page: 1,
      limit: -1,
      search: "",
      flag: "all",
      sortBy: "symbol",
      order: "asc",
    });
    const attention: AttentionItem[] = [];
    for (const market of markets) {
      if (!market.listed) {
        attention.push({
          kind: "unlisted",
          label: "market " + String(market.id) + " is not listed (listed=false)",
        });
      }
      if (!market.tradeEnabled) {
        attention.push({
          kind: "trade-disabled",
          label: "market " + String(market.id) + " has trading disabled (tradeEnabled=false)",
        });
      }
    }
    for (const link of links) {
      if (!link.depositEnabled || !link.withdrawEnabled) {
        attention.push({
          kind: "link-disabled",
          label:
            "chain link " +
            String(link.id) +
            " has disabled flags (deposit=" +
            String(link.depositEnabled) +
            " withdraw=" +
            String(link.withdrawEnabled) +
            ")",
        });
      }
    }
    for (const row of fullStats.data) {
      if (row.markets < 2) {
        attention.push({
          kind: "under-mapped",
          label: row.symbol + " has fewer than two markets (" + String(row.markets) + ")",
        });
      }
    }
    const body = DashboardBody({
      counts: {
        coins: coinStats.meta.items,
        exchanges: exchangeList.meta.items,
        chains: chainList.meta.items,
        markets: markets.length,
      },
      attention: attention.slice(0, 50),
    });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Dashboard", active: "/dashboard", children: body });
  })
  .get("/coins", async ({ hx, set, query }) => {
    const q = str((query as Record<string, unknown>)?.["q"] ?? (query as Record<string, unknown>)?.["search"], "");
    const { rows, total, page, pages } = await coinStatsRows({ search: q, page: 1, limit: 20 });
    const body = CoinsPageBody({ rows, total, q, page, pages });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Coins", active: "/coins", children: body });
  })
  .get("/partials/coins", async ({ set, query }) => {
    const q = str((query as Record<string, unknown>)?.["q"] ?? (query as Record<string, unknown>)?.["search"], "");
    const page = num((query as Record<string, unknown>)?.["page"], 1);
    const sortBy = str((query as Record<string, unknown>)?.["sortBy"] ?? (query as Record<string, unknown>)?.["sort"], "symbol");
    const order = str((query as Record<string, unknown>)?.["order"], "asc");
    const exchangeIdRaw = (query as Record<string, unknown>)?.["exchangeId"];
    const chainIdRaw = (query as Record<string, unknown>)?.["chainId"];
    const flag = str((query as Record<string, unknown>)?.["flag"], "all");
    const { rows, total } = await coinStatsRows({
      search: q,
      page,
      limit: 20,
      sortBy,
      order,
      exchangeId: exchangeIdRaw === undefined || exchangeIdRaw === "" ? undefined : Number(exchangeIdRaw),
      chainId: chainIdRaw === undefined || chainIdRaw === "" ? undefined : Number(chainIdRaw),
      flag,
    });
    setFragmentHeaders(set);
    return CoinsTable({ rows, total });
  })
  .post("/coins", async ({ hx, set, body }) => {
    const fields = (body ?? {}) as Record<string, unknown>;
    const symbol = str(fields["symbol"]).trim();
    const name = str(fields["name"]).trim() || symbol;
    const slug = str(fields["slug"]).trim() || symbol.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    const cmcId = Number(fields["cmcId"]);
    const logo = str(fields["logo"]).trim() || "https://example.com/logo.png";
    if (!symbol) {
      setFragmentHeaders(set);
      hx.retarget("#coin-create-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: "symbol is required" });
    }
    if (!Number.isFinite(cmcId)) {
      setFragmentHeaders(set);
      hx.retarget("#coin-create-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: "cmcId must be a number" });
    }
    try {
      await api.cryptocurrency.add({ symbol, name, slug, cmcId, logo });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#coin-create-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not create coin") });
    }
    hx.pushURL("/coins");
    const { rows, total } = await coinStatsRows({ search: "", page: 1, limit: 20 });
    setFragmentHeaders(set);
    return CoinsTable({ rows, total });
  })
  .get("/coins/:id/edit", async ({ set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const coin = await api.cryptocurrency.findById({ id });
      setFragmentHeaders(set);
      return CoinFormFragment({
        coin: { id: coin.id, symbol: coin.symbol, name: coin.name, slug: coin.slug, cmcId: coin.cmcId, logo: coin.logo },
        action: "/coins/" + String(id),
        target: "#coins-list-region",
      });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
  })
  .post("/coins/:id", async ({ hx, set, params, body }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const fields = (body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ["symbol", "name", "slug", "logo"]) {
      const value = str(fields[key]).trim();
      if (value) patch[key] = value;
    }
    const cmcRaw = fields["cmcId"];
    if (cmcRaw !== undefined && cmcRaw !== "") {
      const parsed = Number(cmcRaw);
      if (Number.isFinite(parsed)) patch["cmcId"] = parsed;
    }
    try {
      await api.cryptocurrency.update({ params: { id }, body: patch as { symbol?: string } });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      setFragmentHeaders(set);
      hx.retarget("#coins-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not update coin") });
    }
    hx.pushURL("/coins");
    const { rows, total } = await coinStatsRows({ search: "", page: 1, limit: 20 });
    setFragmentHeaders(set);
    return CoinsTable({ rows, total });
  })
  .delete("/coins/:id", async ({ set, params, hx }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      await api.cryptocurrency.remove({ id });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
    hx.redirect("/coins");
    setFragmentHeaders(set);
    return "";
  })
  .get("/exchanges", async ({ hx, set }) => {
    const list = await api.exchange.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const rows = await Promise.all(
      list.data.map(async (exchange) => ({
        id: exchange.id,
        name: exchange.name,
        slug: exchange.slug,
        cmcId: exchange.cmcId,
        baseCurrency: exchange.baseCurrency,
        registeredOnCmc: exchange.registeredOnCmc,
        coins: await api.exchangeCryptocurrency.count({ exchangeId: exchange.id }),
      })),
    );
    const body = ExchangesPageBody({ rows, total: list.meta.items });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Exchanges", active: "/exchanges", children: body });
  })
  .post("/exchanges", async ({ hx, set, body }) => {
    const fields = (body ?? {}) as Record<string, unknown>;
    const name = str(fields["name"]).trim();
    const slug = str(fields["slug"]).trim() || name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    const cmcId = Number(fields["cmcId"]);
    const baseCurrency = str(fields["baseCurrency"], "usdt") as "usdt" | "idr";
    if (!name) {
      setFragmentHeaders(set);
      hx.retarget("#exchanges-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: "name is required" });
    }
    try {
      await api.exchange.add({
        name,
        slug,
        cmcId: Number.isFinite(cmcId) ? cmcId : 0,
        logo: "https://example.com/exchange.png",
        baseCurrency: baseCurrency === "idr" ? "idr" : "usdt",
        registeredOnCmc: true,
      });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#exchanges-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not create exchange") });
    }
    hx.pushURL("/exchanges");
    const list = await api.exchange.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const rows = await Promise.all(
      list.data.map(async (exchange) => ({
        id: exchange.id,
        name: exchange.name,
        slug: exchange.slug,
        cmcId: exchange.cmcId,
        baseCurrency: exchange.baseCurrency,
        registeredOnCmc: exchange.registeredOnCmc,
        coins: await api.exchangeCryptocurrency.count({ exchangeId: exchange.id }),
      })),
    );
    setFragmentHeaders(set);
    return ExchangesPageBody({ rows, total: list.meta.items });
  })
  .get("/exchanges/:id", async ({ hx, set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const exchange = await api.exchange.findById({ id });
      const coins = await api.exchangeCryptocurrency.count({ exchangeId: id });
      const body = ExchangeDetailBody({
        exchange: {
          id: exchange.id,
          name: exchange.name,
          slug: exchange.slug,
          cmcId: exchange.cmcId,
          baseCurrency: exchange.baseCurrency,
          registeredOnCmc: exchange.registeredOnCmc,
        },
        coins,
      });
      if (wantsFragment(hx)) {
        setFragmentHeaders(set);
        return body;
      }
      return Layout({ title: exchange.name, active: "/exchanges", children: body });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "exchange not found" });
      }
      throw error;
    }
  })
  .get("/exchanges/:id/edit", async ({ set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const exchange = await api.exchange.findById({ id });
      setFragmentHeaders(set);
      return (
        <div id="modal-slot">
          <form hx-post={"/exchanges/" + String(id)} hx-target="#exchanges-list-region" hx-swap="outerHTML">
            <input name="name" value={exchange.name} />
            <input name="slug" value={exchange.slug} />
            <button type="submit">Save</button>
          </form>
        </div>
      );
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "exchange not found" });
      }
      throw error;
    }
  })
  .post("/exchanges/:id", async ({ hx, set, params, body }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const fields = (body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "slug"]) {
      const value = str(fields[key]).trim();
      if (value) patch[key] = value;
    }
    try {
      await api.exchange.update({ params: { id }, body: patch as { name?: string } });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "exchange not found" });
      }
      setFragmentHeaders(set);
      hx.retarget("#exchanges-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not update exchange") });
    }
    hx.pushURL("/exchanges");
    const list = await api.exchange.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const rows = await Promise.all(
      list.data.map(async (exchange) => ({
        id: exchange.id,
        name: exchange.name,
        slug: exchange.slug,
        cmcId: exchange.cmcId,
        baseCurrency: exchange.baseCurrency,
        registeredOnCmc: exchange.registeredOnCmc,
        coins: await api.exchangeCryptocurrency.count({ exchangeId: exchange.id }),
      })),
    );
    setFragmentHeaders(set);
    return ExchangesPageBody({ rows, total: list.meta.items });
  })
  .delete("/exchanges/:id", async ({ hx, set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const assignments = await api.exchangeCryptocurrency.list({ exchangeId: id });
    if (assignments.length > 0) {
      setFragmentHeaders(set);
      hx.retarget("#exchanges-error");
      hx.reswap("innerHTML");
      return ErrorFragment({
        message:
          "cannot delete exchange with " +
          String(assignments.length) +
          " market assignments; remove the assignments first",
      });
    }
    try {
      await api.exchange.remove({ id });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "exchange not found" });
      }
      throw error;
    }
    hx.redirect("/exchanges");
    setFragmentHeaders(set);
    return "";
  })
  .get("/chains", async ({ hx, set }) => {
    const list = await api.chain.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const allMarkets = await api.exchangeCryptocurrency.list();
    const allLinks = await api.exchangeCryptocurrencyChain.list();
    const marketsById = new Map(allMarkets.map((market) => [market.id, market]));
    const rows = list.data.map((chain) => {
      const coinIds = new Set<number>();
      for (const link of allLinks) {
        if (link.chainId !== chain.id) continue;
        const market = marketsById.get(link.exchangeCryptocurrencyId);
        if (market) coinIds.add(market.cryptocurrencyId);
      }
      return { id: chain.id, name: chain.name, code: chain.code, coins: coinIds.size };
    });
    const body = ChainsPageBody({ rows, total: list.meta.items });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Chains", active: "/chains", children: body });
  })
  .post("/chains", async ({ hx, set, body }) => {
    const fields = (body ?? {}) as Record<string, unknown>;
    const name = str(fields["name"]).trim();
    const code = str(fields["code"]).trim();
    if (!name || !code) {
      setFragmentHeaders(set);
      hx.retarget("#chains-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: "name and code are required" });
    }
    try {
      await api.chain.add({ name, code });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#chains-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not create chain") });
    }
    hx.pushURL("/chains");
    const list = await api.chain.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const rows = list.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code, coins: 0 }));
    setFragmentHeaders(set);
    return ChainsPageBody({ rows, total: list.meta.items });
  })
  .get("/chains/:id", async ({ hx, set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const chain = await api.chain.findById({ id });
      const links = await api.exchangeCryptocurrencyChain.list({ chainId: id });
      const body = ChainDetailBody({
        chain: { id: chain.id, name: chain.name, code: chain.code },
        coins: links.length,
      });
      if (wantsFragment(hx)) {
        setFragmentHeaders(set);
        return body;
      }
      return Layout({ title: chain.name, active: "/chains", children: body });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "chain not found" });
      }
      throw error;
    }
  })
  .get("/chains/:id/edit", async ({ set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const chain = await api.chain.findById({ id });
      setFragmentHeaders(set);
      return (
        <div id="modal-slot">
          <form hx-post={"/chains/" + String(id)} hx-target="#chains-list-region" hx-swap="outerHTML">
            <input name="name" value={chain.name} />
            <input name="code" value={chain.code} />
            <button type="submit">Save</button>
          </form>
        </div>
      );
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "chain not found" });
      }
      throw error;
    }
  })
  .post("/chains/:id", async ({ hx, set, params, body }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const fields = (body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "code"]) {
      const value = str(fields[key]).trim();
      if (value) patch[key] = value;
    }
    try {
      await api.chain.update({ params: { id }, body: patch as { name?: string } });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "chain not found" });
      }
      setFragmentHeaders(set);
      hx.retarget("#chains-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not update chain") });
    }
    hx.pushURL("/chains");
    const list = await api.chain.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" });
    const rows = list.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code, coins: 0 }));
    setFragmentHeaders(set);
    return ChainsPageBody({ rows, total: list.meta.items });
  })
  .delete("/chains/:id", async ({ hx, set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const refs = await api.exchangeCryptocurrencyChain.list({ chainId: id });
    if (refs.length > 0) {
      setFragmentHeaders(set);
      hx.retarget("#chains-error");
      hx.reswap("innerHTML");
      return ErrorFragment({
        message: "cannot delete chain referenced by " + String(refs.length) + " rows; remove the references first",
      });
    }
    try {
      await api.chain.remove({ id });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "chain not found" });
      }
      throw error;
    }
    hx.redirect("/chains");
    setFragmentHeaders(set);
    return "";
  })
  .get("/partials/coins/:id/drawer", async ({ set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const drawer = await renderDrawer(id);
      setFragmentHeaders(set);
      return drawer;
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
  })
  .post("/partials/coins/:id/markets", async ({ hx, set, params, body }) => {
    const coinId = Number((params as Record<string, unknown>)?.["id"]);
    const fields = (body ?? {}) as Record<string, unknown>;
    const exchangeId = Number(fields["exchangeId"]);
    const exchangeSymbol = str(fields["exchangeSymbol"]).trim() || "SYM";
    try {
      await api.cryptocurrency.findById({ id: coinId });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
    try {
      await api.exchangeCryptocurrency.assign({
        exchangeId,
        cryptocurrencyId: coinId,
        exchangeSymbol,
        listed: true,
        tradeEnabled: true,
      });
    } catch (error) {
      setFragmentHeaders(set);
      if (isConflict(error)) {
        hx.retarget("#drawer-error");
        hx.reswap("innerHTML");
        return ErrorFragment({ message: errorMessage(error, "market assignment already exists") });
      }
      if (isNotFound(error)) {
        hx.retarget("#drawer-error");
        hx.reswap("innerHTML");
        return ErrorFragment({ message: errorMessage(error, "exchange or coin not found") });
      }
      throw error;
    }
    hx.pushURL("/coins");
    setFragmentHeaders(set);
    return renderDrawer(coinId);
  })
  .post("/partials/markets/:id/update", async ({ hx, set, params, body }) => {
    const marketId = Number((params as Record<string, unknown>)?.["id"]);
    const fields = (body ?? {}) as Record<string, unknown>;
    const existing = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!existing) {
      set.status = 404;
      return ErrorFragment({ message: "market assignment not found" });
    }
    const patch: Record<string, unknown> = {};
    const symbol = str(fields["exchangeSymbol"]).trim();
    if (symbol) patch["exchangeSymbol"] = symbol;
    try {
      await api.exchangeCryptocurrency.update({ params: { id: marketId }, body: patch as { exchangeSymbol?: string } });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#drawer-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not update market") });
    }
    hx.pushURL("/coins");
    setFragmentHeaders(set);
    return renderDrawer(existing.cryptocurrencyId);
  })
  .delete("/partials/markets/:id", async ({ set, params }) => {
    const marketId = Number((params as Record<string, unknown>)?.["id"]);
    const existing = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!existing) {
      set.status = 404;
      return ErrorFragment({ message: "market assignment not found" });
    }
    await api.exchangeCryptocurrency.unassign({ id: marketId });
    setFragmentHeaders(set);
    return renderDrawer(existing.cryptocurrencyId);
  })
  .post("/partials/markets/:id/chains", async ({ hx, set, params, body }) => {
    const marketId = Number((params as Record<string, unknown>)?.["id"]);
    const market = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!market) {
      set.status = 404;
      return ErrorFragment({ message: "market assignment not found" });
    }
    const fields = (body ?? {}) as Record<string, unknown>;
    const chainId = Number(fields["chainId"]);
    const exchangeChainCode = str(fields["exchangeChainCode"]).trim() || "CODE";
    try {
      await api.exchangeCryptocurrencyChain.add({
        exchangeCryptocurrencyId: marketId,
        chainId,
        exchangeChainCode,
        exchangeChainName: null,
        withdrawEnabled: true,
        depositEnabled: true,
      });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#drawer-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not add chain link") });
    }
    hx.pushURL("/coins");
    setFragmentHeaders(set);
    return renderDrawer(market.cryptocurrencyId);
  })
  .delete("/partials/chain-links/:id", async ({ set, params }) => {
    const linkId = Number((params as Record<string, unknown>)?.["id"]);
    const existing = await api.exchangeCryptocurrencyChain.findById({ id: linkId }).catch(() => undefined);
    if (!existing) {
      set.status = 404;
      return ErrorFragment({ message: "chain link not found" });
    }
    const parent = await api.exchangeCryptocurrency.findById({ id: existing.exchangeCryptocurrencyId }).catch(() => undefined);
    await api.exchangeCryptocurrencyChain.remove({ id: linkId });
    setFragmentHeaders(set);
    if (!parent) return <div id="drawer-body">Removed.</div>;
    return renderDrawer(parent.cryptocurrencyId);
  })
  .post("/partials/chain-links/:id/toggle", async ({ set, params, query }) => {
    const linkId = Number((params as Record<string, unknown>)?.["id"]);
    const flag = str((query as Record<string, unknown>)?.["flag"], "withdraw");
    const existing = await api.exchangeCryptocurrencyChain.findById({ id: linkId }).catch(() => undefined);
    if (!existing) {
      set.status = 404;
      return ErrorFragment({ message: "chain link not found" });
    }
    const parent = await api.exchangeCryptocurrency.findById({ id: existing.exchangeCryptocurrencyId }).catch(() => undefined);
    if (flag === "deposit") {
      await api.exchangeCryptocurrencyChain.update({
        params: { id: linkId },
        body: { depositEnabled: !existing.depositEnabled },
      });
    } else {
      await api.exchangeCryptocurrencyChain.update({
        params: { id: linkId },
        body: { withdrawEnabled: !existing.withdrawEnabled },
      });
    }
    setFragmentHeaders(set);
    if (!parent) return <div id="drawer-body">Updated.</div>;
    return renderDrawer(parent.cryptocurrencyId);
  })
  .get("/coins/:id/routes", async ({ hx, set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const { coin, exchanges, cells } = await buildRouteCells(id);
      const body = RoutesMatrixBody({ coin, exchanges, cells });
      if (wantsFragment(hx)) {
        setFragmentHeaders(set);
        return body;
      }
      return Layout({ title: "Routes " + coin.symbol, active: "/coins", children: body });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
  })
  .get("/partials/coins/:id/routes", async ({ set, params }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    try {
      const { coin, exchanges, cells } = await buildRouteCells(id);
      setFragmentHeaders(set);
      return RoutesMatrixBody({ coin, exchanges, cells });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
  })
  .get("/partials/coins/:id/routes/detail", async ({ set, params, query }) => {
    const id = Number((params as Record<string, unknown>)?.["id"]);
    const fromId = Number((query as Record<string, unknown>)?.["from"]);
    const toId = Number((query as Record<string, unknown>)?.["to"]);
    try {
      const { exchanges, cells, linksByMarket } = await buildRouteCells(id);
      const cell = cells.find((candidate) => candidate.fromMarketId === fromId && candidate.toMarketId === toId);
      if (!cell) {
        set.status = 404;
        return ErrorFragment({ message: "route not found" });
      }
      const fromLinks = linksByMarket.get(fromId) ?? [];
      const toLinks = linksByMarket.get(toId) ?? [];
      const shared = sharedChainIds(fromLinks, toLinks);
      let explanation: string;
      if (cell.status === "full") {
        const via = shared[0];
        const chain = via === undefined ? undefined : await api.chain.findById({ id: via }).catch(() => undefined);
        explanation =
          "Transferable both ways via shared chain " + (chain ? chain.name + " (" + chain.code + ")" : "chain " + String(via));
      } else if (cell.status === "none") {
        explanation =
          shared.length === 0
            ? "No shared chain between " + cell.fromExchange + " and " + cell.toExchange + "; both directions blocked"
            : "Shared chains exist but withdraw/deposit flags block both directions between " + cell.fromExchange + " and " + cell.toExchange;
      } else if (cell.status === "one-way-blocked") {
        explanation =
          "Direction " + cell.fromExchange + " → " + cell.toExchange + " is blocked (withdraw or deposit flag), reverse works";
      } else {
        explanation =
          "Direction " + cell.fromExchange + " → " + cell.toExchange + " works, reverse direction is blocked";
      }
      void exchanges;
      setFragmentHeaders(set);
      return RouteDetailFragment({ explanation });
    } catch (error) {
      if (isNotFound(error)) {
        set.status = 404;
        return ErrorFragment({ message: "coin not found" });
      }
      throw error;
    }
  });
