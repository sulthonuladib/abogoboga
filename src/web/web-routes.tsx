import { Elysia } from "elysia";
import { html, Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import { htmx } from "elysia-htmx";
import { ORPCError } from "@orpc/server";
import { api } from "./client";
import { wantsFragment, setFragmentHeaders } from "./htmx-helpers";
import { Layout, ErrorFragment, NotFoundBody } from "./views/layout";
import { CloseModalOob, CloseDrawerOob, ToastOob } from "./views/ui";
import {
  CoinsPageBody,
  CoinsTableWrap,
  CoinFormFragment,
  type CoinFilterState,
  type CoinFilterLists,
} from "./views/coins";
import {
  ExchangesPageBody,
  ExchangesTableWrap,
  ExchangeFormFragment,
  ExchangeDetailBody,
  ExchangeOptionsFragment,
  type ExchangeRow,
} from "./views/exchanges";
import {
  ChainsPageBody,
  ChainsTableWrap,
  ChainFormFragment,
  ChainDetailBody,
  ChainOptionsFragment,
  type ChainRow,
} from "./views/chains";
import { CoinDrawer, DrawerBody } from "./views/drawer";
import {
  RoutesMatrixBody,
  RouteDetailFragment,
  type RouteMatrixCell,
} from "./views/routes-matrix";
import { DashboardBody, type AttentionItem } from "./views/dashboard";
import {
  orderedPairStatus,
  sharedChainIds,
  viableChains,
  type ChainLinkFlags,
} from "../core/cryptocurrency/transfer";

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function on(value: unknown): boolean {
  return value === "on" || value === "true" || value === "1";
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

type NotFoundKind =
  | "coin"
  | "exchange"
  | "chain"
  | "market"
  | "chain-link"
  | "route";

function notFoundUrl(opts: { kind?: string; id?: string; from?: string }): string {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.kind) params.set("kind", opts.kind);
  if (opts.id) params.set("id", opts.id);
  const qs = params.toString();
  return "/not-found" + (qs ? "?" + qs : "");
}

function isHtmxRequest(hx: { request?: boolean; historyRestoreRequest?: boolean }): boolean {
  return !!hx?.request && !hx?.historyRestoreRequest;
}

/** Centralized entity-miss mapping: full loads 302, htmx gets HX-Redirect. */
function redirectToNotFound(
  hx: { request?: boolean; historyRestoreRequest?: boolean; redirect?: (url: string) => void },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redirectFn: (url: string, status?: any) => unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: { headers: Record<string, any>; status?: any },
  opts: { kind?: NotFoundKind | string; id?: string; from?: string },
) {
  const url = notFoundUrl(opts);
  if (isHtmxRequest(hx)) {
    hx.redirect?.(url);
    set.headers["Vary"] = "HX-Request";
    set.headers["HX-Redirect"] = url;
    return "";
  }
  return redirectFn(url, 302);
}

function rawId(params: Record<string, unknown>, key: string): string {
  const value = params?.[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function parseIdOrRedirect(
  raw: string,
  hx: { request?: boolean; historyRestoreRequest?: boolean; redirect?: (url: string) => void },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redirectFn: (url: string, status?: any) => unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: { headers: Record<string, any>; status?: any },
  kind: NotFoundKind,
  from?: string,
): { id: number } | unknown {
  const id = Number(raw);
  if (!Number.isFinite(id)) {
    return redirectToNotFound(hx, redirectFn, set, { kind, id: raw, from });
  }
  return { id };
}

function parseCoinFilter(query: Record<string, unknown>): CoinFilterState {
  const sortByRaw = str(query["sortBy"] ?? query["sort"], "symbol");
  const sortBy = ["symbol", "markets", "chains", "blocked"].includes(sortByRaw)
    ? sortByRaw
    : "symbol";
  const order = str(query["order"], "asc") === "desc" ? "desc" : "asc";
  const flagRaw = str(query["flag"], "all");
  const flag = flagRaw === "blocked" || flagRaw === "single" ? flagRaw : "all";
  return {
    q: str(query["q"] ?? query["search"], ""),
    sortBy,
    order,
    flag,
    exchangeId: str(query["exchangeId"], ""),
    chainId: str(query["chainId"], ""),
  };
}

function toStatsInput(filter: CoinFilterState, page: number) {
  const exchangeRaw = filter.exchangeId === "" ? undefined : Number(filter.exchangeId);
  const chainRaw = filter.chainId === "" ? undefined : Number(filter.chainId);
  return {
    search: filter.q,
    page,
    limit: 20,
    sortBy: filter.sortBy as "symbol" | "markets" | "chains" | "blocked",
    order: filter.order as "asc" | "desc",
    flag: filter.flag as "all" | "blocked" | "single",
    exchangeId: exchangeRaw !== undefined && Number.isFinite(exchangeRaw) ? exchangeRaw : undefined,
    chainId: chainRaw !== undefined && Number.isFinite(chainRaw) ? chainRaw : undefined,
  };
}

/** Coins table wrap partial (#coins-table-wrap) for a filter + page. */
async function coinsWrap(filter: CoinFilterState, page: number) {
  const result = await api.cryptocurrency.stats(toStatsInput(filter, page));
  return CoinsTableWrap({
    rows: result.data,
    total: result.meta.items,
    page: result.meta.page,
    pages: Math.max(result.meta.pages, 1),
    sortBy: filter.sortBy,
    order: filter.order,
    filter,
  });
}

/** Filter dropdown options for the coins page. */
async function coinFilterLists(): Promise<CoinFilterLists> {
  const [allExchanges, allChains] = await Promise.all([
    api.exchange.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" }),
    api.chain.list({ page: 1, limit: -1, search: "", searchBy: "name", orderBy: "id", order: "asc" }),
  ]);
  return {
    exchanges: allExchanges.data.map((exchange) => ({ id: exchange.id, name: exchange.name })),
    chains: allChains.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code })),
  };
}

async function exchangeRows(
  q: string,
  page = 1,
): Promise<{ rows: ExchangeRow[]; total: number; page: number; pages: number }> {
  const list = await api.exchange.list({
    page,
    limit: 20,
    search: q,
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
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
  return {
    rows,
    total: list.meta.items,
    page: list.meta.page,
    pages: Math.max(list.meta.pages, 1),
  };
}

/** Server-side searchable exchange options (20/page) for assignment forms. */
async function exchangeOptions(
  q: string,
  page = 1,
): Promise<{
  options: Array<{ id: number; name: string }>;
  total: number;
  page: number;
  pages: number;
}> {
  const list = await api.exchange.list({
    page,
    limit: 20,
    search: q,
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
  return {
    options: list.data.map((exchange) => ({ id: exchange.id, name: exchange.name })),
    total: list.meta.items,
    page: list.meta.page,
    pages: Math.max(list.meta.pages, 1),
  };
}

/** Server-side searchable chain options (20/page) for chain-link forms. */
async function chainOptions(
  q: string,
  page = 1,
): Promise<{
  options: Array<{ id: number; name: string; code: string }>;
  total: number;
  page: number;
  pages: number;
}> {
  const list = await api.chain.list({
    page,
    limit: 20,
    search: q,
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
  return {
    options: list.data.map((chain) => ({ id: chain.id, name: chain.name, code: chain.code })),
    total: list.meta.items,
    page: list.meta.page,
    pages: Math.max(list.meta.pages, 1),
  };
}

async function chainRows(
  q: string,
  page = 1,
): Promise<{ rows: ChainRow[]; total: number; page: number; pages: number }> {
  const list = await api.chain.list({
    page,
    limit: 20,
    search: q,
    searchBy: "name",
    orderBy: "id",
    order: "asc",
  });
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
  return {
    rows,
    total: list.meta.items,
    page: list.meta.page,
    pages: Math.max(list.meta.pages, 1),
  };
}

/** Drawer option lists: first 20 only, never the full table.
 * Full search/paging happens through the option partials. */
async function drawerOptionLists(): Promise<{
  exchanges: Array<{ id: number; name: string }>;
  chains: Array<{ id: number; name: string; code: string }>;
}> {
  const [exchanges, chains] = await Promise.all([
    exchangeOptions("", 1),
    chainOptions("", 1),
  ]);
  return { exchanges: exchanges.options, chains: chains.options };
}

/** Full drawer shell partial (#drawer-slot). Single batched metadata call. */
async function renderDrawer(coinId: number) {
  const [metadata, lists] = await Promise.all([
    api.cryptocurrency.metadata({ id: coinId }),
    drawerOptionLists(),
  ]);
  return CoinDrawer({
    metadata,
    lists: { exchanges: lists.exchanges, chains: lists.chains },
  });
}

/** Drawer body partial (#drawer-body) for every market / chain-link mutation. */
async function renderDrawerBody(
  coinId: number,
  overrides?: {
    assignError?: string;
    assignExchangeId?: string;
    assignSymbol?: string;
    assignQuery?: string;
    linkError?: string;
    linkMarketId?: number;
    linkChainId?: string;
    linkCode?: string;
    linkQuery?: string;
  },
) {
  const [metadata, lists] = await Promise.all([
    api.cryptocurrency.metadata({ id: coinId }),
    drawerOptionLists(),
  ]);
  return DrawerBody({
    coinId,
    markets: metadata.exchanges,
    lists: { exchanges: lists.exchanges, chains: lists.chains },
    ...overrides,
  });
}

function metadataLinks(
  market: { chains: Array<{ id: number; withdrawEnabled: boolean; depositEnabled: boolean }> },
): ChainLinkFlags[] {
  return market.chains.map((chain) => ({
    chainId: chain.id,
    withdrawEnabled: chain.withdrawEnabled,
    depositEnabled: chain.depositEnabled,
  }));
}

async function buildRouteCells(coinId: number): Promise<{
  coin: { id: number; symbol: string; name: string };
  exchanges: Array<{ marketId: number; exchangeName: string }>;
  cells: RouteMatrixCell[];
}> {
  const metadata = await api.cryptocurrency.metadata({ id: coinId });
  const exchanges = metadata.exchanges.map((market) => ({
    marketId: market.marketId,
    exchangeName: market.name,
  }));
  const cells: RouteMatrixCell[] = [];
  for (const from of metadata.exchanges) {
    for (const to of metadata.exchanges) {
      if (from.marketId === to.marketId) continue;
      cells.push({
        fromMarketId: from.marketId,
        toMarketId: to.marketId,
        fromExchange: from.name,
        toExchange: to.name,
        status: orderedPairStatus(metadataLinks(from), metadataLinks(to)),
      });
    }
  }
  return {
    coin: { id: metadata.id, symbol: metadata.symbol, name: metadata.name },
    exchanges,
    cells,
  };
}

export const webApp = new Elysia()
  .use(html())
  .use(htmx())
  .get("/", ({ redirect }) => redirect("/dashboard", 302))
  .get("/partials/empty", () => <div id="modal-slot"></div>)
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
    const filter = parseCoinFilter((query ?? {}) as Record<string, unknown>);
    const [result, lists] = await Promise.all([
      api.cryptocurrency.stats(toStatsInput(filter, 1)),
      coinFilterLists(),
    ]);
    const body = CoinsPageBody({
      rows: result.data,
      total: result.meta.items,
      filter,
      lists,
      page: result.meta.page,
      pages: Math.max(result.meta.pages, 1),
    });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Coins", active: "/coins", children: body });
  })
  .get("/partials/coins", async ({ set, query }) => {
    const q = (query ?? {}) as Record<string, unknown>;
    const filter = parseCoinFilter(q);
    const page = num(q["page"], 1);
    setFragmentHeaders(set);
    return coinsWrap(filter, page);
  })
  .get("/coins/new", ({ set }) => {
    setFragmentHeaders(set);
    return CoinFormFragment({ mode: "create", action: "/coins" });
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
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return CoinFormFragment({ mode: "create", action: "/coins", error: "symbol is required" });
    }
    if (!Number.isFinite(cmcId)) {
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return CoinFormFragment({ mode: "create", action: "/coins", error: "cmcId must be a number" });
    }
    try {
      await api.cryptocurrency.add({ symbol, name, slug, cmcId, logo });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return CoinFormFragment({
        mode: "create",
        action: "/coins",
        error: errorMessage(error, "could not create coin"),
      });
    }
    const defaultFilter: CoinFilterState = {
      q: "",
      sortBy: "symbol",
      order: "asc",
      flag: "all",
      exchangeId: "",
      chainId: "",
    };
    setFragmentHeaders(set);
    return (
      <>
        {coinsWrap(defaultFilter, 1) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: symbol + " created" }) as unknown as "safe"}
      </>
    );
  })
  .get("/coins/:id/edit", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const coin = await api.cryptocurrency.findById({ id });
      setFragmentHeaders(set);
      return CoinFormFragment({
        mode: "edit",
        coin: { id: coin.id, symbol: coin.symbol, name: coin.name, slug: coin.slug, cmcId: coin.cmcId, logo: coin.logo },
        action: "/coins/" + String(id),
      });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
  })
  .post("/coins/:id", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      try {
        const coin = await api.cryptocurrency.findById({ id });
        return CoinFormFragment({
          mode: "edit",
          coin: { id: coin.id, symbol: coin.symbol, name: coin.name, slug: coin.slug, cmcId: coin.cmcId, logo: coin.logo },
          action: "/coins/" + String(id),
          error: errorMessage(error, "could not update coin"),
        });
      } catch {
        return ErrorFragment({ message: errorMessage(error, "could not update coin") });
      }
    }
    const defaultFilter: CoinFilterState = {
      q: "",
      sortBy: "symbol",
      order: "asc",
      flag: "all",
      exchangeId: "",
      chainId: "",
    };
    setFragmentHeaders(set);
    return (
      <>
        {coinsWrap(defaultFilter, 1) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: "coin saved" }) as unknown as "safe"}
      </>
    );
  })
  .delete("/coins/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    let symbol = "coin";
    try {
      const coin = await api.cryptocurrency.findById({ id });
      symbol = coin.symbol;
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
    }
    try {
      await api.cryptocurrency.remove({ id });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
    const total = await api.cryptocurrency
      .stats({ page: 1, limit: 1, search: "", flag: "all", sortBy: "symbol", order: "asc" })
      .then((result) => result.meta.items);
    setFragmentHeaders(set);
    return (
      <>
        <span id="coins-count" hx-swap-oob="true" class="badge badge-neutral">
          {String(total)} coins
        </span>
        {ToastOob({ kind: "success", message: symbol + " deleted" }) as unknown as "safe"}
      </>
    );
  })
  .get("/exchanges", async ({ hx, set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const { rows, total, page: cur, pages } = await exchangeRows(q, page);
    const body = ExchangesPageBody({ rows, total, q, page: cur, pages });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Exchanges", active: "/exchanges", children: body });
  })
  .get("/partials/exchanges", async ({ set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const { rows, total, page: cur, pages } = await exchangeRows(q, page);
    setFragmentHeaders(set);
    return ExchangesTableWrap({ rows, total, page: cur, pages, q });
  })
  .get("/exchanges/new", ({ set }) => {
    setFragmentHeaders(set);
    return ExchangeFormFragment({ mode: "create", action: "/exchanges" });
  })
  .post("/exchanges", async ({ hx, set, body }) => {
    const fields = (body ?? {}) as Record<string, unknown>;
    const name = str(fields["name"]).trim();
    const slug = str(fields["slug"]).trim() || name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    const cmcId = Number(fields["cmcId"]);
    const baseCurrency = str(fields["baseCurrency"], "usdt") as "usdt" | "idr";
    if (!name) {
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return ExchangeFormFragment({ mode: "create", action: "/exchanges", error: "name is required" });
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
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return ExchangeFormFragment({
        mode: "create",
        action: "/exchanges",
        error: errorMessage(error, "could not create exchange"),
      });
    }
    const { rows, total, page: cur, pages } = await exchangeRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        {ExchangesTableWrap({ rows, total, page: cur, pages, q: "" }) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: name + " created" }) as unknown as "safe"}
      </>
    );
  })
  .get("/exchanges/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "exchange");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "exchange", id: raw });
      }
      throw error;
    }
  })
  .get("/exchanges/:id/edit", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "exchange");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const exchange = await api.exchange.findById({ id });
      setFragmentHeaders(set);
      return ExchangeFormFragment({
        mode: "edit",
        exchange: {
          id: exchange.id,
          name: exchange.name,
          slug: exchange.slug,
          cmcId: exchange.cmcId,
          baseCurrency: exchange.baseCurrency,
        },
        action: "/exchanges/" + String(id),
      });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "exchange", id: raw });
      }
      throw error;
    }
  })
  .post("/exchanges/:id", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "exchange");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "exchange", id: raw });
      }
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      try {
        const exchange = await api.exchange.findById({ id });
        return ExchangeFormFragment({
          mode: "edit",
          exchange: {
            id: exchange.id,
            name: exchange.name,
            slug: exchange.slug,
            cmcId: exchange.cmcId,
            baseCurrency: exchange.baseCurrency,
          },
          action: "/exchanges/" + String(id),
          error: errorMessage(error, "could not update exchange"),
        });
      } catch {
        return ErrorFragment({ message: errorMessage(error, "could not update exchange") });
      }
    }
    const { rows, total, page: cur, pages } = await exchangeRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        {ExchangesTableWrap({ rows, total, page: cur, pages, q: "" }) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: "exchange saved" }) as unknown as "safe"}
      </>
    );
  })
  .delete("/exchanges/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "exchange");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "exchange", id: raw });
      }
      throw error;
    }
    const { total } = await exchangeRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        <span id="exchanges-count" hx-swap-oob="true" class="badge badge-neutral">
          {String(total)} exchanges
        </span>
        {ToastOob({ kind: "success", message: "exchange deleted" }) as unknown as "safe"}
      </>
    );
  })
  .get("/chains", async ({ hx, set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const { rows, total, page: cur, pages } = await chainRows(q, page);
    const body = ChainsPageBody({ rows, total, q, page: cur, pages });
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({ title: "Chains", active: "/chains", children: body });
  })
  .get("/partials/chains", async ({ set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const { rows, total, page: cur, pages } = await chainRows(q, page);
    setFragmentHeaders(set);
    return ChainsTableWrap({ rows, total, page: cur, pages, q });
  })
  .get("/chains/new", ({ set }) => {
    setFragmentHeaders(set);
    return ChainFormFragment({ mode: "create", action: "/chains" });
  })
  .post("/chains", async ({ hx, set, body }) => {
    const fields = (body ?? {}) as Record<string, unknown>;
    const name = str(fields["name"]).trim();
    const code = str(fields["code"]).trim();
    if (!name || !code) {
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return ChainFormFragment({ mode: "create", action: "/chains", error: "name and code are required" });
    }
    try {
      await api.chain.add({ name, code });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      return ChainFormFragment({
        mode: "create",
        action: "/chains",
        error: errorMessage(error, "could not create chain"),
      });
    }
    const { rows, total, page: cur, pages } = await chainRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        {ChainsTableWrap({ rows, total, page: cur, pages, q: "" }) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: name + " created" }) as unknown as "safe"}
      </>
    );
  })
  .get("/chains/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "chain", id: raw });
      }
      throw error;
    }
  })
  .get("/chains/:id/edit", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const chain = await api.chain.findById({ id });
      setFragmentHeaders(set);
      return ChainFormFragment({
        mode: "edit",
        chain: { id: chain.id, name: chain.name, code: chain.code },
        action: "/chains/" + String(id),
      });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "chain", id: raw });
      }
      throw error;
    }
  })
  .post("/chains/:id", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "chain", id: raw });
      }
      setFragmentHeaders(set);
      hx.retarget("#modal-slot");
      hx.reswap("innerHTML");
      try {
        const chain = await api.chain.findById({ id });
        return ChainFormFragment({
          mode: "edit",
          chain: { id: chain.id, name: chain.name, code: chain.code },
          action: "/chains/" + String(id),
          error: errorMessage(error, "could not update chain"),
        });
      } catch {
        return ErrorFragment({ message: errorMessage(error, "could not update chain") });
      }
    }
    const { rows, total, page: cur, pages } = await chainRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        {ChainsTableWrap({ rows, total, page: cur, pages, q: "" }) as unknown as "safe"}
        {CloseModalOob() as unknown as "safe"}
        {ToastOob({ kind: "success", message: "chain saved" }) as unknown as "safe"}
      </>
    );
  })
  .delete("/chains/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
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
        return redirectToNotFound(hx, redirect, set, { kind: "chain", id: raw });
      }
      throw error;
    }
    const { total } = await chainRows("", 1);
    setFragmentHeaders(set);
    return (
      <>
        <span id="chains-count" hx-swap-oob="true" class="badge badge-neutral">
          {String(total)} chains
        </span>
        {ToastOob({ kind: "success", message: "chain deleted" }) as unknown as "safe"}
      </>
    );
  })
  .get("/partials/coins/:id/drawer", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const drawer = await renderDrawer(id);
      setFragmentHeaders(set);
      return drawer;
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
  })
  .post("/partials/coins/:id/markets", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const coinId = (parsed as { id: number }).id;
    const fields = (body ?? {}) as Record<string, unknown>;
    const exchangeIdRaw = str(fields["exchangeId"], "");
    const exchangeId = Number(fields["exchangeId"]);
    const exchangeSymbol = str(fields["exchangeSymbol"]).trim() || "SYM";
    const assignQuery = str(fields["q"], "");
    try {
      await api.cryptocurrency.findById({ id: coinId });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
    if (!Number.isFinite(exchangeId)) {
      setFragmentHeaders(set);
      return renderDrawerBody(coinId, {
        assignError: "select an exchange",
        assignExchangeId: exchangeIdRaw,
        assignSymbol: str(fields["exchangeSymbol"], ""),
        assignQuery,
      });
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
        return renderDrawerBody(coinId, {
          assignError: errorMessage(error, "market assignment already exists"),
          assignExchangeId: exchangeIdRaw,
          assignSymbol: str(fields["exchangeSymbol"], ""),
          assignQuery,
        });
      }
      if (isNotFound(error)) {
        return renderDrawerBody(coinId, {
          assignError: errorMessage(error, "exchange or coin not found"),
          assignExchangeId: exchangeIdRaw,
          assignSymbol: str(fields["exchangeSymbol"], ""),
          assignQuery,
        });
      }
      throw error;
    }
    setFragmentHeaders(set);
    return (
      <>
        {renderDrawerBody(coinId) as unknown as "safe"}
        {ToastOob({ kind: "success", message: "market assigned" }) as unknown as "safe"}
      </>
    );
  })
  .post("/partials/markets/:id/update", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "market");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const marketId = (parsed as { id: number }).id;
    const fields = (body ?? {}) as Record<string, unknown>;
    const existing = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!existing) {
      return redirectToNotFound(hx, redirect, set, { kind: "market", id: raw });
    }
    const patch: Record<string, unknown> = {
      listed: on(fields["listed"]),
      tradeEnabled: on(fields["tradeEnabled"]),
    };
    const symbol = str(fields["exchangeSymbol"]).trim();
    if (symbol) patch["exchangeSymbol"] = symbol;
    try {
      await api.exchangeCryptocurrency.update({
        params: { id: marketId },
        body: patch as { exchangeSymbol?: string; listed?: boolean; tradeEnabled?: boolean },
      });
    } catch (error) {
      setFragmentHeaders(set);
      hx.retarget("#drawer-error");
      hx.reswap("innerHTML");
      return ErrorFragment({ message: errorMessage(error, "could not update market") });
    }
    setFragmentHeaders(set);
    return (
      <>
        {renderDrawerBody(existing.cryptocurrencyId) as unknown as "safe"}
        {ToastOob({ kind: "success", message: "market saved" }) as unknown as "safe"}
      </>
    );
  })
  .delete("/partials/markets/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "market");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const marketId = (parsed as { id: number }).id;
    const existing = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!existing) {
      return redirectToNotFound(hx, redirect, set, { kind: "market", id: raw });
    }
    await api.exchangeCryptocurrency.unassign({ id: marketId });
    setFragmentHeaders(set);
    return (
      <>
        {renderDrawerBody(existing.cryptocurrencyId) as unknown as "safe"}
        {ToastOob({ kind: "success", message: "market unassigned" }) as unknown as "safe"}
      </>
    );
  })
  .post("/partials/markets/:id/chains", async ({ hx, redirect, set, params, body }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "market");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const marketId = (parsed as { id: number }).id;
    const market = await api.exchangeCryptocurrency.findById({ id: marketId }).catch(() => undefined);
    if (!market) {
      return redirectToNotFound(hx, redirect, set, { kind: "market", id: raw });
    }
    const fields = (body ?? {}) as Record<string, unknown>;
    const chainIdRaw = str(fields["chainId"], "");
    const chainId = Number(fields["chainId"]);
    const exchangeChainCode = str(fields["exchangeChainCode"]).trim() || "CODE";
    const linkQuery = str(fields["q"], "");
    if (!Number.isFinite(chainId)) {
      setFragmentHeaders(set);
      return renderDrawerBody(market.cryptocurrencyId, {
        linkError: "select a chain",
        linkMarketId: marketId,
        linkChainId: chainIdRaw,
        linkCode: str(fields["exchangeChainCode"], ""),
        linkQuery,
      });
    }
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
      return renderDrawerBody(market.cryptocurrencyId, {
        linkError: errorMessage(error, "could not add chain link"),
        linkMarketId: marketId,
        linkChainId: chainIdRaw,
        linkCode: str(fields["exchangeChainCode"], ""),
        linkQuery,
      });
    }
    setFragmentHeaders(set);
    return (
      <>
        {renderDrawerBody(market.cryptocurrencyId) as unknown as "safe"}
        {ToastOob({ kind: "success", message: "chain linked" }) as unknown as "safe"}
      </>
    );
  })
  .delete("/partials/chain-links/:id", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain-link");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const linkId = (parsed as { id: number }).id;
    const existing = await api.exchangeCryptocurrencyChain.findById({ id: linkId }).catch(() => undefined);
    if (!existing) {
      return redirectToNotFound(hx, redirect, set, { kind: "chain-link", id: raw });
    }
    const parent = await api.exchangeCryptocurrency.findById({ id: existing.exchangeCryptocurrencyId }).catch(() => undefined);
    await api.exchangeCryptocurrencyChain.remove({ id: linkId });
    setFragmentHeaders(set);
    if (!parent) return <div id="drawer-body"><div class="alert alert-info"><span>Removed.</span></div></div>;
    return (
      <>
        {renderDrawerBody(parent.cryptocurrencyId) as unknown as "safe"}
        {ToastOob({ kind: "success", message: "chain link removed" }) as unknown as "safe"}
      </>
    );
  })
  .post("/partials/chain-links/:id/toggle", async ({ hx, redirect, set, params, query }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "chain-link");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const linkId = (parsed as { id: number }).id;
    const flag = str((query as Record<string, unknown>)?.["flag"], "withdraw");
    const existing = await api.exchangeCryptocurrencyChain.findById({ id: linkId }).catch(() => undefined);
    if (!existing) {
      return redirectToNotFound(hx, redirect, set, { kind: "chain-link", id: raw });
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
    if (!parent) return <div id="drawer-body"><div class="alert alert-info"><span>Updated.</span></div></div>;
    const next = flag === "deposit" ? !existing.depositEnabled : !existing.withdrawEnabled;
    return (
      <>
        {renderDrawerBody(parent.cryptocurrencyId) as unknown as "safe"}
        {ToastOob({ kind: "info", message: flag + " " + (next ? "on" : "off") }) as unknown as "safe"}
      </>
    );
  })
  .get("/coins/:id/routes", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const { coin, exchanges, cells } = await buildRouteCells(id);
      const body = RoutesMatrixBody({ coin, exchanges, cells });
      if (wantsFragment(hx)) {
        setFragmentHeaders(set);
        return (
          <>
            {body as unknown as "safe"}
            {CloseDrawerOob() as unknown as "safe"}
          </>
        );
      }
      return Layout({ title: "Routes " + coin.symbol, active: "/coins", children: body });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
  })
  .get("/partials/coins/:id/routes", async ({ hx, redirect, set, params }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    try {
      const { coin, exchanges, cells } = await buildRouteCells(id);
      setFragmentHeaders(set);
      return (
        <>
          {RoutesMatrixBody({ coin, exchanges, cells }) as unknown as "safe"}
          {CloseDrawerOob() as unknown as "safe"}
        </>
      );
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
  })
  .get("/not-found", async ({ hx, set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const from = str(qq["from"], "");
    const kind = str(qq["kind"], "");
    const id = str(qq["id"], "");
    const body = NotFoundBody({
      from: from || undefined,
      kind: kind || undefined,
      id: id || undefined,
    });
    set.status = 404;
    if (wantsFragment(hx)) {
      setFragmentHeaders(set);
      return body;
    }
    return Layout({
      title: "Not found",
      active: "",
      children: body,
    });
  })
  .get("/partials/exchanges/options", async ({ set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const target = str(qq["target"], "exchange-options") || "exchange-options";
    const select = str(qq["select"], "exchangeId") || "exchangeId";
    const selected = str(qq["selected"], "") || undefined;
    const { options, total, page: cur, pages } = await exchangeOptions(q, page);
    setFragmentHeaders(set);
    return ExchangeOptionsFragment({
      options,
      total,
      page: cur,
      pages,
      q,
      targetId: target,
      selectName: select,
      selectedId: selected,
    });
  })
  .get("/partials/chains/options", async ({ set, query }) => {
    const qq = (query ?? {}) as Record<string, unknown>;
    const q = str(qq["q"], "");
    const page = num(qq["page"], 1);
    const target = str(qq["target"], "chain-options") || "chain-options";
    const select = str(qq["select"], "chainId") || "chainId";
    const selected = str(qq["selected"], "") || undefined;
    const { options, total, page: cur, pages } = await chainOptions(q, page);
    setFragmentHeaders(set);
    return ChainOptionsFragment({
      options,
      total,
      page: cur,
      pages,
      q,
      targetId: target,
      selectName: select,
      selectedId: selected,
    });
  })
  .get("/partials/coins/:id/routes/detail", async ({ hx, redirect, set, params, query }) => {
    const raw = rawId(params as Record<string, unknown>, "id");
    const parsed = parseIdOrRedirect(raw, hx, redirect, set, "coin");
    if (typeof (parsed as { id?: number }).id !== "number") return parsed;
    const id = (parsed as { id: number }).id;
    const fromId = Number((query as Record<string, unknown>)?.["from"]);
    const toId = Number((query as Record<string, unknown>)?.["to"]);
    if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
      return redirectToNotFound(hx, redirect, set, {
        kind: "route",
        id: raw + ":" + String((query as Record<string, unknown>)?.["from"]) + "-" + String((query as Record<string, unknown>)?.["to"]),
      });
    }
    try {
      const metadata = await api.cryptocurrency.metadata({ id });
      const from = metadata.exchanges.find((market) => market.marketId === fromId);
      const to = metadata.exchanges.find((market) => market.marketId === toId);
      if (!from || !to) {
        return redirectToNotFound(hx, redirect, set, {
          kind: "route",
          id: String(fromId) + "-" + String(toId),
        });
      }
      const fromLinks = metadataLinks(from);
      const toLinks = metadataLinks(to);
      const forward = viableChains(fromLinks, toLinks);
      const backward = viableChains(toLinks, fromLinks);
      const chainName = new Map<number, string>();
      for (const market of [from, to]) {
        for (const chain of market.chains) chainName.set(chain.id, chain.name + " (" + chain.code + ")");
      }
      const shared = sharedChainIds(fromLinks, toLinks);
      const sharedNames = shared.map((chainId) => chainName.get(chainId) ?? "chain " + String(chainId));
      const viableNames = (ids: number[]) =>
        ids.map((chainId) => chainName.get(chainId) ?? "chain " + String(chainId)).join(", ");
      let explanation: string;
      if (forward.length > 0 && backward.length > 0) {
        explanation =
          from.name + " ⇄ " + to.name + " transferable both ways via " + viableNames(forward);
      } else if (forward.length === 0 && backward.length === 0) {
        explanation =
          shared.length === 0
            ? "No shared chain between " + from.name + " and " + to.name + "; both directions blocked"
            : "Shared chains exist (" +
              viableNames(shared) +
              ") but withdraw/deposit flags block both directions between " +
              from.name +
              " and " +
              to.name;
      } else if (forward.length === 0) {
        explanation =
          from.name + " → " + to.name + " is blocked (withdraw or deposit flag); reverse works via " + viableNames(backward);
      } else {
        explanation =
          from.name + " → " + to.name + " works via " + viableNames(forward) + "; reverse direction is blocked";
      }
      const status = orderedPairStatus(fromLinks, toLinks);
      setFragmentHeaders(set);
      return RouteDetailFragment({ from: from.name, to: to.name, status, explanation, shared: sharedNames });
    } catch (error) {
      if (isNotFound(error)) {
        return redirectToNotFound(hx, redirect, set, { kind: "coin", id: raw });
      }
      throw error;
    }
  })
  .get("/*", async ({ hx, redirect, set, request }) => {
    const pathname = new URL(request.url).pathname;
    if (
      pathname.startsWith("/api/") ||
      pathname === "/api" ||
      pathname.startsWith("/static/") ||
      pathname === "/openapi.json" ||
      pathname === "/docs" ||
      pathname === "/docs/"
    ) {
      set.status = 404;
      return "Not found";
    }
    return redirectToNotFound(hx, redirect, set, { from: pathname });
  });
