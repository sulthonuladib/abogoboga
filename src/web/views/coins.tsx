import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type CoinStatsRow = {
  id: number;
  symbol: string;
  name: string;
  slug: string;
  cmcId: number;
  logo: string;
  markets: number;
  chains: number;
  blocked: number;
};

export function CoinsFilterBar({ q }: { q: string }) {
  return (
    <form
      id="coins-filter"
      class="flex flex-wrap items-center gap-2"
      hx-get="/partials/coins"
      hx-target="#coins-table-body"
      hx-swap="innerHTML"
      hx-trigger="input changed delay:300ms from:#coins-search, change from:#coins-sort"
      hx-sync="#coins-search:abort"
      hx-indicator="#coins-loading"
    >
      <input
        id="coins-search"
        name="q"
        type="search"
        placeholder="Search coins…"
        value={q}
        class="input input-bordered input-sm w-64"
        hx-get="/partials/coins"
        hx-target="#coins-table-body"
        hx-swap="innerHTML"
        hx-trigger="input changed delay:300ms"
        hx-sync="this:abort"
        hx-indicator="#coins-loading"
      />
      <select id="coins-sort" name="sortBy" class="select select-bordered select-sm">
        <option value="symbol">symbol</option>
        <option value="markets">markets</option>
        <option value="chains">chains</option>
        <option value="blocked">blocked</option>
      </select>
      <span id="coins-loading" class="htmx-indicator items-center gap-2 text-sm opacity-70">
        <span class="loading loading-spinner loading-sm"></span>
        Loading…
      </span>
    </form>
  );
}

export function CoinsTable({
  rows,
  total,
}: {
  rows: CoinStatsRow[];
  total: number;
}) {
  return (
    <div id="coins-list-region">
      <div class="my-2">
        <span id="coins-count" class="badge badge-ghost" hx-swap-oob="true">
          {String(total)} coins
        </span>
      </div>
      <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-zebra w-full table-sm">
          <thead>
            <tr>
              <th>symbol</th>
              <th>name</th>
              <th>slug</th>
              <th>cmcId</th>
              <th>markets</th>
              <th>chains</th>
              <th>blocked</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody id="coins-table-body">
            {rows.map((row) => (
              <tr id={"coin-row-" + String(row.id)}>
                <td class="font-mono font-semibold">{row.symbol}</td>
                <td>{row.name}</td>
                <td class="font-mono text-sm opacity-70">{row.slug}</td>
                <td>{String(row.cmcId)}</td>
                <td>
                  <span class="badge badge-ghost">{String(row.markets)}</span>
                </td>
                <td>
                  <span class="badge badge-ghost">{String(row.chains)}</span>
                </td>
                <td>
                  {row.blocked > 0 ? (
                    <span class="badge badge-error">{String(row.blocked)}</span>
                  ) : (
                    <span class="badge badge-success">{String(row.blocked)}</span>
                  )}
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-primary btn-xs"
                      hx-get={"/partials/coins/" + String(row.id) + "/drawer"}
                      hx-target="#drawer-slot"
                      hx-swap="innerHTML"
                    >
                      Open
                    </button>
                    <button
                      class="btn btn-ghost btn-xs"
                      hx-get={"/coins/" + String(row.id) + "/edit"}
                      hx-target="#modal-slot"
                      hx-swap="innerHTML"
                    >
                      Edit
                    </button>
                    <button
                      class="btn btn-error btn-outline btn-xs"
                      hx-delete={"/coins/" + String(row.id)}
                      hx-swap="none"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CoinsPageBody({
  rows,
  total,
  q,
  page,
  pages,
}: {
  rows: CoinStatsRow[];
  total: number;
  q: string;
  page: number;
  pages: number;
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">Coins</h1>
      <div id="coins-error"></div>
      {CoinsFilterBar({ q }) as unknown as "safe"}
      {CoinsTable({ rows, total }) as unknown as "safe"}
      <div id="coins-pagination" class="my-3 flex items-center gap-2">
        <span class="text-sm opacity-70">
          Page {String(page)} of {String(pages)}
        </span>
        <div class="join">
          {page > 1 ? (
            <button
              class="join-item btn btn-sm"
              hx-get={"/partials/coins?page=" + String(page - 1) + "&q=" + encodeURIComponent(q)}
              hx-target="#coins-table-body"
              hx-swap="innerHTML"
            >
              Prev
            </button>
          ) : (
            ""
          )}
          {page < pages ? (
            <button
              class="join-item btn btn-sm"
              hx-get={"/partials/coins?page=" + String(page + 1) + "&q=" + encodeURIComponent(q)}
              hx-target="#coins-table-body"
              hx-swap="innerHTML"
            >
              Next
            </button>
          ) : (
            ""
          )}
        </div>
      </div>
      <div class="card mt-6 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <h2 class="card-title text-lg">New coin</h2>
          <div id="coin-create-error"></div>
          <form
            class="flex flex-wrap gap-2"
            hx-post="/coins"
            hx-target="#coins-list-region"
            hx-swap="outerHTML"
          >
            <input name="symbol" placeholder="symbol (required)" class="input input-bordered input-sm" />
            <input name="name" placeholder="name" class="input input-bordered input-sm" />
            <input name="slug" placeholder="slug" class="input input-bordered input-sm" />
            <input name="cmcId" placeholder="cmcId" inputmode="numeric" class="input input-bordered input-sm w-28" />
            <input name="logo" placeholder="logo url" class="input input-bordered input-sm grow" />
            <button type="submit" class="btn btn-primary btn-sm">Create</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function CoinFormFragment({
  coin,
  error,
  action,
  target,
}: {
  coin?: { id: number; symbol: string; name: string; slug: string; cmcId: number; logo: string };
  error?: string;
  action: string;
  target: string;
}) {
  return (
    <div id="modal-slot">
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="mb-3 text-lg font-bold">Edit coin</h3>
          {error ? <div class="alert alert-error my-2" role="alert"><span>{error}</span></div> : ""}
          <form hx-post={action} hx-target={target} hx-swap="outerHTML" class="flex flex-col gap-2">
            <input name="symbol" placeholder="symbol" value={coin?.symbol ?? ""} class="input input-bordered input-sm w-full" />
            <input name="name" placeholder="name" value={coin?.name ?? ""} class="input input-bordered input-sm w-full" />
            <input name="slug" placeholder="slug" value={coin?.slug ?? ""} class="input input-bordered input-sm w-full" />
            <input
              name="cmcId"
              placeholder="cmcId"
              value={coin ? String(coin.cmcId) : ""}
              class="input input-bordered input-sm w-full"
            />
            <input name="logo" placeholder="logo" value={coin?.logo ?? ""} class="input input-bordered input-sm w-full" />
            <div class="modal-action">
              <button type="submit" class="btn btn-primary btn-sm">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
