import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { Chain } from "../../core/chain/chain.type";
import {
  EmptyState,
  Field,
  InlineLoading,
  ModalShell,
  PageHeader,
  SubmitButton,
} from "./ui";

export type ChainRow = Pick<Chain, "id" | "name" | "code"> & {
  coins: number;
};

function ChainAvatar({ code }: { code: string }) {
  return (
    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-xs font-bold text-secondary-content">
      {(code || "?").slice(0, 3).toUpperCase()}
    </div>
  );
}

export function ChainsFilterBar({ q }: { q: string }) {
  return (
    <div class="card mb-4 bg-base-100 shadow-sm">
      <div class="card-body p-4">
        <form
          id="chains-filter"
          hx-get="/partials/chains"
          hx-target="#chains-table-wrap"
          hx-swap="innerHTML"
          hx-trigger="input changed delay:400ms from:#chains-search, change"
          hx-sync="this:abort"
          hx-indicator="#chains-loading"
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
                id="chains-search"
                name="q"
                type="search"
                placeholder="Ethereum, bep20…"
                value={q}
                class="grow"
                autocomplete="off"
              />
            </label>
          </label>
          {InlineLoading({ id: "chains-loading" }) as unknown as "safe"}
        </form>
      </div>
    </div>
  );
}

export function ChainsTableWrap({
  rows,
  total,
  page,
  pages,
  q,
}: {
  rows: ChainRow[];
  total: number;
  page: number;
  pages: number;
  q: string;
}) {
  const isFiltered = q.trim() !== "";
  return (
    <div id="chains-table-wrap">
      <div id="chains-error"></div>
      <div class="mb-2 flex items-center gap-2">
        <span id="chains-count" class="badge badge-neutral">
          {String(total)} chains
        </span>
        <span class="text-xs opacity-50">20 per page</span>
      </div>
      <div class="card bg-base-100 shadow-sm">
        {rows.length === 0 ? (
          isFiltered
            ? (EmptyState({
                title: "No chains match these filters",
                hint: "Try a different search, or start fresh.",
                actions: (
                  <>
                    <a
                      class="btn btn-ghost btn-sm"
                      href="/chains"
                      hx-get="/chains"
                      hx-target="#main-content"
                      hx-swap="innerHTML show:top"
                      hx-push-url="true"
                    >
                      Clear filters
                    </a>
                    <button
                      class="btn btn-primary btn-sm"
                      hx-get="/chains/new"
                      hx-target="#modal-slot"
                      hx-swap="innerHTML"
                    >
                      + New chain
                    </button>
                  </>
                ),
              }) as unknown as "safe")
            : (EmptyState({
                title: "No chains yet",
                hint: "Create your first chain to enable transfer routes.",
                actions: (
                  <button
                    class="btn btn-primary btn-sm"
                    hx-get="/chains/new"
                    hx-target="#modal-slot"
                    hx-swap="innerHTML"
                  >
                    + New chain
                  </button>
                ),
              }) as unknown as "safe")
        ) : (
          <div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Code</th>
                  <th>Coins</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="chains-table-body">
                {rows.map((row) => (
                  <tr id={"chain-row-" + String(row.id)} class="hover">
                    <td>
                      <div class="flex items-center gap-3">
                        {ChainAvatar({ code: row.code }) as unknown as "safe"}
                        <a
                          class="font-semibold hover:text-primary"
                          href={"/chains/" + String(row.id)}
                          hx-get={"/chains/" + String(row.id)}
                          hx-target="#main-content"
                          hx-swap="innerHTML show:top"
                          hx-push-url="true"
                        >
                          {row.name}
                        </a>
                      </div>
                    </td>
                    <td>
                      <span class="badge badge-ghost badge-sm font-mono">
                        {row.code}
                      </span>
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
                          hx-get={"/chains/" + String(row.id)}
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
                                hx-get={"/chains/" + String(row.id) + "/edit"}
                                hx-target="#modal-slot"
                                hx-swap="innerHTML"

                              >
                                Edit chain
                              </button>
                            </li>
                            <li>
                              <button
                                class="text-error"
                                hx-delete={"/chains/" + String(row.id)}
                                hx-confirm={
                                  "Delete " + row.name + "? Linked markets must be removed first."
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
            hx-get={"/partials/chains?page=" + String(page - 1)}
            hx-include="#chains-filter"
            hx-target="#chains-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#chains-loading"
          >
            « Prev
          </button>
          <button
            class="join-item btn btn-sm"
            disabled={page >= pages}
            hx-get={"/partials/chains?page=" + String(page + 1)}
            hx-include="#chains-filter"
            hx-target="#chains-table-wrap"
            hx-swap="innerHTML show:top"
            hx-indicator="#chains-loading"
          >
            Next »
          </button>
        </div>
      </div>
    </div>
  );
}

/** Searchable + paginated chain options for chain-link forms. */
export function ChainOptionsFragment({
  options,
  total,
  page,
  pages,
  q,
  targetId,
  selectName,
  selectedId,
}: {
  options: Array<{ id: number; name: string; code: string }>;
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
              Search chains
            </span>
          </div>
          <input
            type="search"
            name="q"
            value={q}
            placeholder="Ethereum, bep20…"
            autocomplete="off"
            class="input input-bordered input-sm w-full"
            hx-get={"/partials/chains/options?target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
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
              {opt.name} ({opt.code})
            </option>
          )) as unknown as "safe"}
        </select>
      </div>
      {options.length === 0 ? (
        <p class="mt-1 text-xs opacity-60">
          No chains match — <button
            class="link"
            hx-get={"/partials/chains/options?target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName)}
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
              hx-get={"/partials/chains/options?page=" + String(page - 1) + "&q=" + encodeURIComponent(q) + "&target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
              hx-target={"#" + targetId}
              hx-swap="outerHTML"
            >
              «
            </button>
            <button
              type="button"
              class="join-item btn btn-xs"
              disabled={page >= pages}
              hx-get={"/partials/chains/options?page=" + String(page + 1) + "&q=" + encodeURIComponent(q) + "&target=" + encodeURIComponent(targetId) + "&select=" + encodeURIComponent(selectName) + (selectedId ? "&selected=" + encodeURIComponent(selectedId) : "")}
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

export function ChainsPageBody({
  rows,
  total,
  q,
  page,
  pages,
}: {
  rows: ChainRow[];
  total: number;
  q: string;
  page: number;
  pages: number;
}) {
  return (
    <div>
      {PageHeader({
        title: "Chains",
        subtitle:
          "Networks a coin can move on. Chains are attached to exchange markets, not to coins directly.",
        actions: (
          <button
            class="btn btn-primary btn-sm"
            hx-get="/chains/new"
            hx-target="#modal-slot"
            hx-swap="innerHTML"
          >
            + New chain
          </button>
        ),
      }) as unknown as "safe"}
      {ChainsFilterBar({ q }) as unknown as "safe"}
      {ChainsTableWrap({ rows, total, page, pages, q }) as unknown as "safe"}
    </div>
  );
}

export function ChainFormFragment({
  mode,
  chain,
  error,
  action,
}: {
  mode: "create" | "edit";
  chain?: { id: number; name: string; code: string };
  error?: string;
  action: string;
}) {
  const isCreate = mode === "create";
  return ModalShell({
    title: isCreate ? "New chain" : "Edit chain",
    subtitle: isCreate
      ? "Chains appear in the table as soon as they are created."
      : "Changes apply immediately to the chains table.",
    error,
    children: (
      <form
        hx-post={action}
        hx-target="#chains-table-wrap"
        hx-swap="outerHTML"
        hx-indicator="#chain-form-loading"
        hx-disabled-elt="find button[type=submit]"
        class="flex flex-col gap-3"
      >
        {Field({
          label: "Name *",
          children: (
            <input
              name="name"
              placeholder="Ethereum"
              required
              value={chain?.name ?? ""}
              class="input input-bordered input-sm w-full"
            />
          ),
        }) as unknown as "safe"}
        {Field({
          label: "Code *",
          hint: "Short network code, e.g. erc20, bep20, trc20.",
          children: (
            <input
              name="code"
              placeholder="erc20"
              required
              value={chain?.code ?? ""}
              class="input input-bordered input-sm w-full font-mono"
            />
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
            label: isCreate ? "Create chain" : "Save changes",
            indicatorId: "chain-form-loading",
          }) as unknown as "safe"}
        </div>
      </form>
    ),
  });
}

export function ChainDetailBody({
  chain,
  coins,
}: {
  chain: { id: number; name: string; code: string };
  coins: number;
}) {
  return (
    <div>
      {PageHeader({
        title: chain.name,
        subtitle: "Chain detail",
        crumbs: [{ label: "Chains", href: "/chains" }, { label: chain.name }],
        actions: (
          <div class="flex gap-2">
            <button
              class="btn btn-ghost btn-sm"
              hx-get={"/chains/" + String(chain.id) + "/edit"}
              hx-target="#modal-slot"
              hx-swap="innerHTML"
            >
              Edit
            </button>
            <a
              class="btn btn-ghost btn-sm"
              href="/chains"
              hx-get="/chains"
              hx-target="#main-content"
              hx-swap="innerHTML show:top"
              hx-push-url="true"
            >
              ← All chains
            </a>
          </div>
        ),
      }) as unknown as "safe"}
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">Code</div>
          <div class="stat-value font-mono text-lg">{chain.code}</div>
        </div>
        <div class="stat rounded-box bg-base-100 shadow-sm">
          <div class="stat-title">Referencing coins</div>
          <div class="stat-value text-lg text-primary">{String(coins)}</div>
        </div>
      </div>
    </div>
  );
}
