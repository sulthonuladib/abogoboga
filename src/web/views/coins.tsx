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
        hx-get="/partials/coins"
        hx-target="#coins-table-body"
        hx-swap="innerHTML"
        hx-trigger="input changed delay:300ms"
        hx-sync="this:abort"
        hx-indicator="#coins-loading"
      />
      <select id="coins-sort" name="sortBy">
        <option value="symbol">symbol</option>
        <option value="markets">markets</option>
        <option value="chains">chains</option>
        <option value="blocked">blocked</option>
      </select>
      <span id="coins-loading" class="htmx-indicator">
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
      <div>
        <span id="coins-count" hx-swap-oob="true">
          {String(total)} coins
        </span>
      </div>
      <table>
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
              <td>{row.symbol}</td>
              <td>{row.name}</td>
              <td>{row.slug}</td>
              <td>{String(row.cmcId)}</td>
              <td>{String(row.markets)}</td>
              <td>{String(row.chains)}</td>
              <td>{String(row.blocked)}</td>
              <td>
                <button
                  hx-get={"/partials/coins/" + String(row.id) + "/drawer"}
                  hx-target="#drawer-slot"
                  hx-swap="innerHTML"
                >
                  Open
                </button>{" "}
                <button
                  hx-get={"/coins/" + String(row.id) + "/edit"}
                  hx-target="#modal-slot"
                  hx-swap="innerHTML"
                >
                  Edit
                </button>{" "}
                <button
                  hx-delete={"/coins/" + String(row.id)}
                  hx-swap="none"
                >
                  Delete
                </button>
              </td>
            </tr>
          )) as unknown as "safe"}
        </tbody>
      </table>
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
      <h1>Coins</h1>
      <div id="coins-error"></div>
      {CoinsFilterBar({ q }) as unknown as "safe"}
      {CoinsTable({ rows, total }) as unknown as "safe"}
      <div id="coins-pagination">
        <span>
          Page {String(page)} of {String(pages)}
        </span>{" "}
        {page > 1 ? (
          <button
            hx-get={"/partials/coins?page=" + String(page - 1) + "&q=" + encodeURIComponent(q)}
            hx-target="#coins-table-body"
            hx-swap="innerHTML"
          >
            Prev
          </button>
        ) : (
          ""
        )}{" "}
        {page < pages ? (
          <button
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
      <h2>New coin</h2>
      <div id="coin-create-error"></div>
      <form
        hx-post="/coins"
        hx-target="#coins-list-region"
        hx-swap="outerHTML"
      >
        <input name="symbol" placeholder="symbol (required)" />
        <input name="name" placeholder="name" />
        <input name="slug" placeholder="slug" />
        <input name="cmcId" placeholder="cmcId" inputmode="numeric" />
        <input name="logo" placeholder="logo url" />
        <button type="submit">Create</button>
      </form>
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
      {error ? <div class="error" role="alert">{error}</div> : ""}
      <form hx-post={action} hx-target={target} hx-swap="outerHTML">
        <input name="symbol" placeholder="symbol" value={coin?.symbol ?? ""} />
        <input name="name" placeholder="name" value={coin?.name ?? ""} />
        <input name="slug" placeholder="slug" value={coin?.slug ?? ""} />
        <input
          name="cmcId"
          placeholder="cmcId"
          value={coin ? String(coin.cmcId) : ""}
        />
        <input name="logo" placeholder="logo" value={coin?.logo ?? ""} />
        <button type="submit">Save</button>
      </form>
    </div>
  );
}
