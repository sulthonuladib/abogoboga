import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { ListingStatsRow } from "../../core/cryptocurrency/cryptocurrency.type";
import {
  EmptyState,
  Field,
  InlineLoading,
  ModalShell,
  PageHeader,
  SubmitButton,
} from "./ui";

/** One row of the coins table — the core listing-stats shape, no copy. */
export type CoinStatsRow = ListingStatsRow;

export type CoinFilterLists = {
  exchanges: Array<{ id: number; name: string }>;
  chains: Array<{ id: number; name: string; code: string }>;
};

export type CoinFilterState = {
  q: string;
  sortBy: string;
  order: string;
  flag: string;
  exchangeId: string;
  chainId: string;
};

function sortArrow(sortBy: string, order: string, column: string): string {
  if (sortBy !== column) return "";
  return order === "desc" ? " ▼" : " ▲";
}

function nextOrder(sortBy: string, order: string, column: string): string {
  if (sortBy !== column) return "asc";
  return order === "desc" ? "asc" : "desc";
}

export function CoinsFilterBar({
  filter,
  lists,
}: {
  filter: CoinFilterState;
  lists: CoinFilterLists;
}) {
  return (
    <div class="card mb-4 bg-base-100 shadow-sm">
      <div class="card-body gap-3 p-4">
        <form
          id="coins-filter"
          hx-get="/partials/coins"
          hx-target="#coins-table-wrap"
          hx-swap="innerHTML"
          hx-trigger="input changed delay:400ms from:#coins-search, change"
          hx-sync="this:abort"
          hx-indicator="#coins-loading"
        >
          <div class="flex flex-wrap items-end gap-2">
            <label class="form-control w-full max-w-xs">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Search
                </span>
              </div>
              <label class="input input-sm input-bordered flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="h-4 w-4 opacity-50"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                <input
                  id="coins-search"
                  name="q"
                  type="search"
                  placeholder="BTC, bitcoin…"
                  value={filter.q}
                  class="grow"
                  autocomplete="off"
                />
              </label>
            </label>
            <label class="form-control w-36">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Exchange
                </span>
              </div>
              <select name="exchangeId" class="select select-bordered select-sm">
                <option value="" selected={filter.exchangeId === ""}>
                  All
                </option>
                {lists.exchanges.map((exchange) => (
                  <option
                    value={String(exchange.id)}
                    selected={filter.exchangeId === String(exchange.id)}
                  >
                    {exchange.name}
                  </option>
                )) as unknown as "safe"}
              </select>
            </label>
            <label class="form-control w-36">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Chain
                </span>
              </div>
              <select name="chainId" class="select select-bordered select-sm">
                <option value="" selected={filter.chainId === ""}>
                  All
                </option>
                {lists.chains.map((chain) => (
                  <option
                    value={String(chain.id)}
                    selected={filter.chainId === String(chain.id)}
                  >
                    {chain.name} ({chain.code})
                  </option>
                )) as unknown as "safe"}
              </select>
            </label>
            <label class="form-control w-32">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Health
                </span>
              </div>
              <select name="flag" class="select select-bordered select-sm">
                <option value="all" selected={filter.flag === "all"}>
                  All
                </option>
                <option value="blocked" selected={filter.flag === "blocked"}>
                  Blocked
                </option>
                <option value="single" selected={filter.flag === "single"}>
                  Single market
                </option>
              </select>
            </label>
            <label class="form-control w-32">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Sort by
                </span>
              </div>
              <select name="sortBy" class="select select-bordered select-sm">
                <option value="symbol" selected={filter.sortBy === "symbol"}>
                  Symbol
                </option>
                <option value="markets" selected={filter.sortBy === "markets"}>
                  Markets
                </option>
                <option value="chains" selected={filter.sortBy === "chains"}>
                  Chains
                </option>
                <option value="blocked" selected={filter.sortBy === "blocked"}>
                  Blocked
                </option>
              </select>
            </label>
            <label class="form-control w-28">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Order
                </span>
              </div>
              <select name="order" class="select select-bordered select-sm">
                <option value="asc" selected={filter.order === "asc"}>
                  Asc
                </option>
                <option value="desc" selected={filter.order === "desc"}>
                  Desc
                </option>
              </select>
            </label>
            {InlineLoading({ id: "coins-loading" }) as unknown as "safe"}
          </div>
        </form>
      </div>
    </div>
  );
}

function SortTh({
  column,
  label,
  sortBy,
  order,
}: {
  column: string;
  label: string;
  sortBy: string;
  order: string;
}) {
  return (
    <th>
      <button
        class="inline-flex items-center gap-1 font-semibold hover:text-primary"
        hx-get={
          "/partials/coins?sortBy=" +
          column +
          "&order=" +
          nextOrder(sortBy, order, column)
        }
        hx-include="#coins-filter"
        hx-target="#coins-table-wrap"
        hx-swap="innerHTML"
        hx-indicator="#coins-loading"
        title={"Sort by " + label}
      >
        {label}
        <span class="text-xs opacity-60">
          {sortArrow(sortBy, order, column)}
        </span>
      </button>
    </th>
  );
}

function CoinAvatar({ row }: { row: CoinStatsRow }) {
  const initial = (row.symbol || "?").slice(0, 1).toUpperCase();
  return (
    <div class="relative h-9 w-9 shrink-0">
      <div class="absolute inset-0 flex items-center justify-center rounded-full bg-neutral font-bold text-neutral-content">
        {initial}
      </div>
      {row.logo ? (
        <img
          src={row.logo}
          alt=""
          loading="lazy"
          class="absolute inset-0 h-9 w-9 rounded-full object-cover ring-1 ring-base-300"
        />
      ) : (
        ""
      )}
    </div>
  );
}

export function CoinsTableWrap({
  rows,
  total,
  page,
  pages,
  sortBy,
  order,
  filter,
}: {
  rows: CoinStatsRow[];
  total: number;
  page: number;
  pages: number;
  sortBy: string;
  order: string;
  filter?: CoinFilterState;
}) {
  const hasFilter = filter
    ? filter.q.trim() !== "" ||
      filter.exchangeId !== "" ||
      filter.chainId !== "" ||
      filter.flag !== "all"
    : false;
  return (
    <div id="coins-table-wrap">
      <div id="coins-error"></div>
      <div class="mb-2 flex items-center gap-2">
        <span id="coins-count" class="badge badge-neutral">
          {String(total)} coins
        </span>
        <span class="text-xs opacity-50">20 per page</span>
      </div>
      <div class="card bg-base-100 shadow-sm">
        {rows.length === 0 ? (
          hasFilter ? (
            (EmptyState({
              title: "No coins match these filters",
              hint: "Try a different search, or clear the exchange / chain filters.",
              actions: (
                <>
                  <a
                    class="btn btn-ghost btn-sm"
                    href="/coins"
                    hx-get="/coins"
                    hx-target="#main-content"
                    hx-swap="innerHTML show:top"
                    hx-push-url="true"
                  >
                    Clear filters
                  </a>
                  <button
                    class="btn btn-primary btn-sm"
                    hx-get="/coins/new"
                    hx-target="#modal-slot"
                    hx-swap="innerHTML"
                  >
                    + New coin
                  </button>
                </>
              ),
            }) as unknown as "safe")
          ) : (
            (EmptyState({
              title: "No coins yet",
              hint: "Create your first coin to start mapping markets and routes.",
              actions: (
                <button
                  class="btn btn-primary btn-sm"
                  hx-get="/coins/new"
                  hx-target="#modal-slot"
                  hx-swap="innerHTML"
                >
                  + New coin
                </button>
              ),
            }) as unknown as "safe")
          )
        ) : (
          <div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  {SortTh({ column: "symbol", label: "Coin", sortBy, order }) as unknown as "safe"}
                  <th class="hidden lg:table-cell">Slug</th>
                  <th class="hidden md:table-cell">CMC</th>
                  {SortTh({ column: "markets", label: "Markets", sortBy, order }) as unknown as "safe"}
                  {SortTh({ column: "chains", label: "Chains", sortBy, order }) as unknown as "safe"}
                  {SortTh({ column: "blocked", label: "Blocked", sortBy, order }) as unknown as "safe"}
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="coins-table-body">
                {rows.map((row) => (
                  <tr id={"coin-row-" + String(row.id)} class="hover">
                    <td>
                      <div class="flex items-center gap-3">
                        {CoinAvatar({ row }) as unknown as "safe"}
                        <div>
                          <div class="font-mono font-bold leading-tight">
                            {row.symbol}
                          </div>
                          <div class="max-w-40 truncate text-xs opacity-60">
                            {row.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="hidden font-mono text-xs opacity-70 lg:table-cell">
                      {row.slug}
                    </td>
                    <td class="hidden md:table-cell">{String(row.cmcId)}</td>
                    <td>
                      <span class="badge badge-ghost badge-sm">
                        {String(row.markets)}
                      </span>
                    </td>
                    <td>
                      <span class="badge badge-ghost badge-sm">
                        {String(row.chains)}
                      </span>
                    </td>
                    <td>
                      {row.blocked > 0 ? (
                        <span
                          class="badge badge-error badge-sm"
                          title={String(row.blocked) + " blocked chain links"}
                        >
                          {String(row.blocked)}
                        </span>
                      ) : (
                        <span class="badge badge-success badge-sm" title="All clear">
                          0
                        </span>
                      )}
                    </td>
                    <td>
                      <div class="flex items-center justify-end gap-1">
                        <button
                          class="btn btn-primary btn-xs"
                          hx-get={"/partials/coins/" + String(row.id) + "/drawer"}
                          hx-target="#drawer-slot"
                          hx-swap="innerHTML"
                          hx-indicator="#global-bar"
                        >
                          Markets
                        </button>
                        <details class="dropdown dropdown-end">
                          <summary
                            class="btn btn-ghost btn-xs"
                            aria-label={"More actions for " + row.symbol}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke-width="1.5"
                              stroke="currentColor"
                              class="h-4 w-4"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                              />
                            </svg>
                          </summary>
                          <ul class="menu dropdown-content z-30 w-48 rounded-box bg-base-100 p-2 shadow">
                            <li>
                              <button
                                hx-get={"/coins/" + String(row.id) + "/routes"}
                                hx-target="#main-content"
                                hx-swap="innerHTML show:top"
                                hx-push-url="true"

                              >
                                Transfer routes
                              </button>
                            </li>
                            <li>
                              <button
                                hx-get={"/coins/" + String(row.id) + "/edit"}
                                hx-target="#modal-slot"
                                hx-swap="innerHTML"

                              >
                                Edit coin
                              </button>
                            </li>
                            <li>
                              <button
                                class="text-error"
                                hx-delete={"/coins/" + String(row.id)}
                                hx-confirm={"Delete " + row.symbol + " permanently?"}
                                hx-target="closest tr"
                                hx-swap="outerHTML swap:150ms"

                              >
                                Delete
                              </button>
                            </li>
                          </ul>
                        </details>
                      </div>
                    </td>
                  </tr>
                )) as unknown as "safe"}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm opacity-70">
          Page {String(page)} of {String(pages)}
        </span>
        <div class="join">
          <button
            class="join-item btn btn-sm"
            disabled={page <= 1}
            hx-get={"/partials/coins?page=" + String(page - 1)}
            hx-include="#coins-filter"
            hx-target="#coins-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#coins-loading"
          >
            « Prev
          </button>
          <button
            class="join-item btn btn-sm"
            disabled={page >= pages}
            hx-get={"/partials/coins?page=" + String(page + 1)}
            hx-include="#coins-filter"
            hx-target="#coins-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#coins-loading"
          >
            Next »
          </button>
        </div>
      </div>
    </div>
  );
}

// Backwards-compatible table fragment (wrap without pagination context).
export function CoinsTable({
  rows,
  total,
}: {
  rows: CoinStatsRow[];
  total: number;
}) {
  return CoinsTableWrap({
    rows,
    total,
    page: 1,
    pages: 1,
    sortBy: "symbol",
    order: "asc",
  });
}

export function CoinsPageBody({
  rows,
  total,
  filter,
  lists,
  page,
  pages,
}: {
  rows: CoinStatsRow[];
  total: number;
  filter: CoinFilterState;
  lists: CoinFilterLists;
  page: number;
  pages: number;
}) {
  return (
    <div>
      {PageHeader({
        title: "Coins",
        subtitle:
          "Search, filter and sort every coin. Open a coin to manage its exchange markets and chain links.",
        actions: (
          <button
            class="btn btn-primary btn-sm"
            hx-get="/coins/new"
            hx-target="#modal-slot"
            hx-swap="innerHTML"
          >
            + New coin
          </button>
        ),
      }) as unknown as "safe"}
      {CoinsFilterBar({ filter, lists }) as unknown as "safe"}
      {CoinsTableWrap({ rows, total, page, pages, sortBy: filter.sortBy, order: filter.order, filter }) as unknown as "safe"}
    </div>
  );
}

export function CoinFormFragment({
  mode,
  coin,
  error,
  action,
}: {
  mode: "create" | "edit";
  coin?: {
    id: number;
    symbol: string;
    name: string;
    slug: string;
    cmcId: number;
    logo: string;
  };
  error?: string;
  action: string;
}) {
  const isCreate = mode === "create";
  return ModalShell({
    title: isCreate ? "New coin" : "Edit coin",
    subtitle: isCreate
      ? "Coins appear in the table as soon as they are created."
      : "Changes apply immediately to the coins table.",
    error,
    children: (
      <form
        hx-post={action}
        hx-target="#coins-table-wrap"
        hx-swap="outerHTML"
        hx-indicator="#coin-form-loading"
        hx-disabled-elt="find button[type=submit]"
        class="flex flex-col gap-3"
      >
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-1">
            {Field({
              label: "Symbol *",
              children: (
                <input
                  name="symbol"
                  placeholder="BTC"
                  required
                  value={coin?.symbol ?? ""}
                  class="input input-bordered input-sm w-full font-mono uppercase"
                />
              ),
            }) as unknown as "safe"}
          </div>
          <div class="col-span-1">
            {Field({
              label: "CMC id *",
              children: (
                <input
                  name="cmcId"
                  placeholder="1"
                  inputmode="numeric"
                  required
                  value={coin ? String(coin.cmcId) : ""}
                  class="input input-bordered input-sm w-full"
                />
              ),
            }) as unknown as "safe"}
          </div>
        </div>
        {Field({
          label: "Name",
          children: (
            <input
              name="name"
              placeholder="Bitcoin"
              value={coin?.name ?? ""}
              class="input input-bordered input-sm w-full"
            />
          ),
        }) as unknown as "safe"}
        {Field({
          label: "Slug",
          hint: "Lowercase URL id — auto-generated from the symbol when empty.",
          children: (
            <input
              name="slug"
              placeholder="bitcoin"
              value={coin?.slug ?? ""}
              class="input input-bordered input-sm w-full font-mono"
            />
          ),
        }) as unknown as "safe"}
        {Field({
          label: "Logo URL",
          children: (
            <div class="flex items-center gap-2">
              <img
                id="coin-logo-preview"
                src={coin?.logo ?? ""}
                alt=""
                class="h-8 w-8 shrink-0 rounded-full bg-base-200 object-cover ring-1 ring-base-300"
              />
              <input
                name="logo"
                placeholder="https://…/logo.png"
                value={coin?.logo ?? ""}
                class="input input-bordered input-sm w-full"
              />
            </div>
          ),
        }) as unknown as "safe"}
        <div class="modal-action mt-1">
          <button
            type="submit"
            formmethod="dialog"
            formnovalidate
            class="btn btn-ghost btn-sm"
            aria-label="Cancel and close dialog"
          >
            Cancel
          </button>
          {SubmitButton({
            label: isCreate ? "Create coin" : "Save changes",
            indicatorId: "coin-form-loading",
          }) as unknown as "safe"}
        </div>
      </form>
    ),
  });
}
