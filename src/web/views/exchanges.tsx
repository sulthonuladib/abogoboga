import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { Exchange } from "../../core/exchange/exchange.type";
import {
  EmptyState,
  Field,
  InlineLoading,
  ModalShell,
  PageHeader,
  SubmitButton,
} from "./ui";

export type ExchangeRow = Pick<
  Exchange,
  "id" | "name" | "slug" | "cmcId" | "baseCurrency" | "registeredOnCmc"
> & { coins: number };

function ExchangeAvatar({ name }: { name: string }) {
  return (
    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-content">
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ExchangesFilterBar({ q }: { q: string }) {
  return (
    <div class="card mb-4 bg-base-100 shadow-sm">
      <div class="card-body p-4">
        <form
          id="exchanges-filter"
          hx-get="/partials/exchanges"
          hx-target="#exchanges-table-wrap"
          hx-swap="innerHTML"
          hx-trigger="input changed delay:400ms from:#exchanges-search, change"
          hx-sync="this:abort"
          hx-indicator="#exchanges-loading"
          class="flex flex-wrap items-end gap-2"
        >
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
                id="exchanges-search"
                name="q"
                type="search"
                placeholder="Binance, bybit…"
                value={q}
                class="grow"
                autocomplete="off"
              />
            </label>
          </label>
          {InlineLoading({ id: "exchanges-loading" }) as unknown as "safe"}
        </form>
      </div>
    </div>
  );
}

export function ExchangesTableWrap({
  rows,
  total,
  page,
  pages,
  q,
}: {
  rows: ExchangeRow[];
  total: number;
  page: number;
  pages: number;
  q: string;
}) {
  const isFiltered = q.trim() !== "";
  return (
    <div id="exchanges-table-wrap">
      <div id="exchanges-error"></div>
      <div class="mb-2 flex items-center gap-2">
        <span id="exchanges-count" class="badge badge-neutral">
          {String(total)} exchanges
        </span>
        <span class="text-xs opacity-50">20 per page</span>
      </div>
      <div class="card bg-base-100 shadow-sm">
        {rows.length === 0 ? (
          isFiltered
            ? (EmptyState({
                title: "No exchanges match these filters",
                hint: "Try a different search, or start fresh.",
                actions: (
                  <>
                    <a
                      class="btn btn-ghost btn-sm"
                      href="/exchanges"
                      hx-get="/exchanges"
                      hx-target="#main-content"
                      hx-swap="innerHTML show:top"
                      hx-push-url="true"
                    >
                      Clear filters
                    </a>
                    <button
                      class="btn btn-primary btn-sm"
                      hx-get="/exchanges/new"
                      hx-target="#modal-slot"
                      hx-swap="innerHTML"
                    >
                      + New exchange
                    </button>
                  </>
                ),
              }) as unknown as "safe")
            : (EmptyState({
                title: "No exchanges yet",
                hint: "Create your first exchange to start mapping markets.",
                actions: (
                  <button
                    class="btn btn-primary btn-sm"
                    hx-get="/exchanges/new"
                    hx-target="#modal-slot"
                    hx-swap="innerHTML"
                  >
                    + New exchange
                  </button>
                ),
              }) as unknown as "safe")
        ) : (
          <div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th class="hidden lg:table-cell">Slug</th>
                  <th class="hidden md:table-cell">CMC</th>
                  <th>Base</th>
                  <th class="hidden sm:table-cell">On CMC</th>
                  <th>Coins</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="exchanges-table-body">
                {rows.map((row) => (
                  <tr id={"exchange-row-" + String(row.id)} class="hover">
                    <td>
                      <div class="flex items-center gap-3">
                        {ExchangeAvatar({ name: row.name }) as unknown as "safe"}
                        <a
                          class="font-semibold hover:text-primary"
                          href={"/exchanges/" + String(row.id)}
                          hx-get={"/exchanges/" + String(row.id)}
                          hx-target="#main-content"
                          hx-swap="innerHTML show:top"
                          hx-push-url="true"
                        >
                          {row.name}
                        </a>
                      </div>
                    </td>
                    <td class="hidden font-mono text-xs opacity-70 lg:table-cell">
                      {row.slug}
                    </td>
                    <td class="hidden md:table-cell">{String(row.cmcId)}</td>
                    <td>
                      <span class="badge badge-ghost badge-sm font-mono">
                        {row.baseCurrency}
                      </span>
                    </td>
                    <td class="hidden sm:table-cell">
                      {row.registeredOnCmc ? (
                        <span class="badge badge-success badge-sm">yes</span>
                      ) : (
                        <span class="badge badge-ghost badge-sm">no</span>
                      )}
                    </td>
                    <td>
                      <span class="badge badge-ghost badge-sm">
                        {String(row.coins)}
                      </span>
                    </td>
                    <td>
                      <div class="flex items-center justify-end gap-1">
                        <button
                          class="btn btn-ghost btn-xs"
                          hx-get={"/exchanges/" + String(row.id)}
                          hx-target="#main-content"
                          hx-swap="innerHTML show:top"
                          hx-push-url="true"
                        >
                          View
                        </button>
                        <details class="dropdown dropdown-end">
                          <summary
                            class="btn btn-ghost btn-xs"
                            aria-label={"More actions for " + row.name}
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
                          <ul class="menu dropdown-content z-30 w-44 rounded-box bg-base-100 p-2 shadow">
                            <li>
                              <button
                                hx-get={"/exchanges/" + String(row.id) + "/edit"}
                                hx-target="#modal-slot"
                                hx-swap="innerHTML"

                              >
                                Edit exchange
                              </button>
                            </li>
                            <li>
                              <button
                                class="text-error"
                                hx-delete={"/exchanges/" + String(row.id)}
                                hx-confirm={
                                  "Delete " + row.name + "? Markets must be removed first."
                                }
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
            hx-get={"/partials/exchanges?page=" + String(page - 1)}
            hx-include="#exchanges-filter"
            hx-target="#exchanges-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#exchanges-loading"
          >
            « Prev
          </button>
          <button
            class="join-item btn btn-sm"
            disabled={page >= pages}
            hx-get={"/partials/exchanges?page=" + String(page + 1)}
            hx-include="#exchanges-filter"
            hx-target="#exchanges-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#exchanges-loading"
          >
            Next »
          </button>
        </div>
      </div>
    </div>
  );
}

/** Searchable + paginated exchange options for assignment forms.
 * Target container owns its id so search/paging swaps in place. */
export function ExchangeOptionsFragment({
  options,
  total,
  page,
  pages,
  q,
  targetId,
  selectName,
  selectedId,
}: {
  options: Array<{ id: number; name: string }>;
  total: number;
  page: number;
  pages: number;
  q: string;
  targetId: string;
  selectName: string;
  selectedId?: string;
}) {
  return (
    <div id={targetId}>
      <div class="flex flex-wrap items-end gap-2">
        <label class="form-control min-w-40 flex-1">
          <div class="label py-1">
            <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
              Search exchanges
            </span>
          </div>
          <input
            type="search"
            name="q"
            value={q}
            placeholder="Binance, bybit…"
            autocomplete="off"
            class="input input-bordered input-sm w-full"
            hx-get={"/partials/exchanges/options?target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
            hx-target={"#" + targetId}
            hx-swap="outerHTML"
            hx-trigger="input changed delay:300ms, change"
            hx-indicator="#global-bar"
          />
        </label>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <select name={selectName} class="select select-bordered select-sm w-full">
          {selectedId && !options.some((o) => String(o.id) === selectedId) ? (
            <option value={selectedId} selected>
              Selected #{selectedId}
            </option>
          ) : (
            ""
          )}
          {options.map((opt) => (
            <option value={String(opt.id)} selected={selectedId === String(opt.id)}>
              {opt.name}
            </option>
          )) as unknown as "safe"}
        </select>
      </div>
      {options.length === 0 ? (
        <p class="mt-1 text-xs opacity-60">
          No exchanges match — <button
            class="link"
            hx-get={"/partials/exchanges/options?target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName)}
            hx-target={"#" + targetId}
            hx-swap="outerHTML"
          >
            clear the search
          </button>.
        </p>
      ) : (
        <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs opacity-60">
            {String(total)} matches · Page {String(page)} of {String(pages)}
          </span>
          <div class="join">
            <button
              type="button"
              class="join-item btn btn-xs"
              disabled={page <= 1}
              hx-get={"/partials/exchanges/options?page=" + String(page - 1) + "&q=" + encodeURIComponent(q) + "&target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
              hx-target={"#" + targetId}
              hx-swap="outerHTML"
            >
              «
            </button>
            <button
              type="button"
              class="join-item btn btn-xs"
              disabled={page >= pages}
              hx-get={"/partials/exchanges/options?page=" + String(page + 1) + "&q=" + encodeURIComponent(q) + "&target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
              hx-target={"#" + targetId}
              hx-swap="outerHTML"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExchangesPageBody({
  rows,
  total,
  q,
  page,
  pages,
}: {
  rows: ExchangeRow[];
  total: number;
  q: string;
  page: number;
  pages: number;
}) {
  return (
    <div>
      {PageHeader({
        title: "Exchanges",
        subtitle:
          "Every venue a coin can be listed on. Open one to see its listed coins.",
        actions: (
          <button
            class="btn btn-primary btn-sm"
            hx-get="/exchanges/new"
            hx-target="#modal-slot"
            hx-swap="innerHTML"
          >
            + New exchange
          </button>
        ),
      }) as unknown as "safe"}
      {ExchangesFilterBar({ q }) as unknown as "safe"}
      {ExchangesTableWrap({ rows, total, page, pages, q }) as unknown as "safe"}
    </div>
  );
}

export function ExchangeFormFragment({
  mode,
  exchange,
  error,
  action,
}: {
  mode: "create" | "edit";
  exchange?: {
    id: number;
    name: string;
    slug: string;
    cmcId: number;
    baseCurrency: string;
  };
  error?: string;
  action: string;
}) {
  const isCreate = mode === "create";
  return ModalShell({
    title: isCreate ? "New exchange" : "Edit exchange",
    subtitle: isCreate
      ? "Exchanges appear in the table as soon as they are created."
      : "Changes apply immediately to the exchanges table.",
    error,
    children: (
      <form
        hx-post={action}
        hx-target="#exchanges-table-wrap"
        hx-swap="outerHTML"
        hx-indicator="#exchange-form-loading"
        hx-disabled-elt="find button[type=submit]"
        class="flex flex-col gap-3"
      >
        {Field({
          label: "Name *",
          children: (
            <input
              name="name"
              placeholder="Binance"
              required
              value={exchange?.name ?? ""}
              class="input input-bordered input-sm w-full"
            />
          ),
        }) as unknown as "safe"}
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-1">
            {Field({
              label: "Slug",
              hint: "Auto-generated from the name when empty.",
              children: (
                <input
                  name="slug"
                  placeholder="binance"
                  value={exchange?.slug ?? ""}
                  class="input input-bordered input-sm w-full font-mono"
                />
              ),
            }) as unknown as "safe"}
          </div>
          <div class="col-span-1">
            {Field({
              label: "CMC id",
              children: (
                <input
                  name="cmcId"
                  placeholder="0"
                  inputmode="numeric"
                  value={exchange ? String(exchange.cmcId) : ""}
                  class="input input-bordered input-sm w-full"
                />
              ),
            }) as unknown as "safe"}
          </div>
        </div>
        {isCreate
          ? (Field({
              label: "Base currency",
              children: (
                <select
                  name="baseCurrency"
                  class="select select-bordered select-sm w-full"
                >
                  <option value="usdt">usdt</option>
                  <option value="idr">idr</option>
                </select>
              ),
            }) as unknown as "safe")
          : ""}
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
            label: isCreate ? "Create exchange" : "Save changes",
            indicatorId: "exchange-form-loading",
          }) as unknown as "safe"}
        </div>
      </form>
    ),
  });
}

export function ExchangeDetailBody({
  exchange,
  coins,
}: {
  exchange: {
    id: number;
    name: string;
    slug: string;
    cmcId: number;
    baseCurrency: string;
    registeredOnCmc: boolean | null;
  };
  coins: number;
}) {
  return (
    <div>
      {PageHeader({
        title: exchange.name,
        subtitle: "Exchange detail",
        crumbs: [{ label: "Exchanges", href: "/exchanges" }, { label: exchange.name }],
        actions: (
          <div class="flex gap-2">
            <button
              class="btn btn-ghost btn-sm"
              hx-get={"/exchanges/" + String(exchange.id) + "/edit"}
              hx-target="#modal-slot"
              hx-swap="innerHTML"
            >
              Edit
            </button>
            <a
              class="btn btn-ghost btn-sm"
              href="/exchanges"
              hx-get="/exchanges"
              hx-target="#main-content"
              hx-swap="innerHTML show:top"
              hx-push-url="true"
            >
              ← All exchanges
            </a>
          </div>
        ),
      }) as unknown as "safe"}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">Slug</div>
          <div class="stat-value font-mono text-lg">{exchange.slug}</div>
        </div>
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">CMC id</div>
          <div class="stat-value text-lg">{String(exchange.cmcId)}</div>
        </div>
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">Base currency</div>
          <div class="stat-value font-mono text-lg">{exchange.baseCurrency}</div>
        </div>
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">Listed coins</div>
          <div class="stat-value text-lg text-primary">{String(coins)}</div>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-2 text-sm">
        <span class="opacity-60">Registered on CMC</span>
        {exchange.registeredOnCmc ? (
          <span class="badge badge-success badge-sm">yes</span>
        ) : (
          <span class="badge badge-ghost badge-sm">no</span>
        )}
      </div>
    </div>
  );
}
