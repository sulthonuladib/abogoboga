/**
 * Coins page, table fragment, and coin form views.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"
import { EmptyState, Modal, PageHeader, Pagination, TextInput, Field, Select } from "./Controls.ts"

/**
 * One coins-table row: listing coverage plus identity for actions.
 */
export type CoinStatsRow = {
  readonly id: number
  readonly symbol: string
  readonly name: string
  readonly slug: string
  readonly coingeckoId: string
  readonly logo: string
  readonly markets: number
  readonly chains: number
  readonly blocked: number
}

/**
 * Filter dropdown option lists for the coins page.
 */
export type CoinFilterLists = {
  readonly exchanges: ReadonlyArray<{ readonly id: number; readonly name: string }>
  readonly chains: ReadonlyArray<{ readonly id: number; readonly name: string; readonly code: string }>
}

/**
 * Parsed coin filter state from query parameters.
 */
export type CoinFilterState = {
  readonly q: string
  readonly sortBy: "symbol" | "markets" | "chains" | "blocked"
  readonly order: "asc" | "desc"
  readonly flag: "all" | "blocked" | "single"
  readonly exchangeId: string
  readonly chainId: string
}

const sortArrow = (sortBy: string, order: string, column: string): string => {
  if (sortBy !== column) return ""

  return order === "desc" ? " ▼" : " ▲"
}

const nextOrder = (sortBy: string, order: string, column: string): string => {
  if (sortBy !== column) return "asc"

  return order === "desc" ? "asc" : "desc"
}

/**
 * Renders the coins filter bar (search, exchange, chain, health, sort).
 *
 * @param options - Current filter plus dropdown lists.
 * @returns The filter fragment.
 */
export const CoinsFilterBar = (options: { readonly filter: CoinFilterState; readonly lists: CoinFilterLists }): RawHtml =>
  html`<div class="card mb-4 bg-base-100 shadow-sm">
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
              <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Search</span>
            </div>
            <label class="input input-sm input-bordered flex items-center gap-2">
              <input
                id="coins-search"
                name="q"
                type="search"
                placeholder="BTC, bitcoin…"
                value="${options.filter.q}"
                class="grow"
                autocomplete="off"
              />
            </label>
          </label>
          ${Select({
            name: "exchangeId",
            selected: options.filter.exchangeId === "" ? undefined : options.filter.exchangeId,
            placeholder: "All exchanges",
            choices: options.lists.exchanges.map((exchange) => ({
              value: String(exchange.id),
              label: exchange.name
            }))
          })}
          ${Select({
            name: "chainId",
            selected: options.filter.chainId === "" ? undefined : options.filter.chainId,
            placeholder: "All chains",
            choices: options.lists.chains.map((chain) => ({
              value: String(chain.id),
              label: `${chain.name} (${chain.code})`
            }))
          })}
          ${Select({
            name: "flag",
            selected: options.filter.flag,
            choices: [
              { value: "all", label: "All" },
              { value: "blocked", label: "Blocked" },
              { value: "single", label: "Single market" }
            ]
          })}
          ${Select({
            name: "sortBy",
            selected: options.filter.sortBy,
            choices: [
              { value: "symbol", label: "Symbol" },
              { value: "markets", label: "Markets" },
              { value: "chains", label: "Chains" },
              { value: "blocked", label: "Blocked" }
            ]
          })}
          ${Select({
            name: "order",
            selected: options.filter.order,
            choices: [
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" }
            ]
          })}
          <span id="coins-loading" class="htmx-indicator loading loading-spinner loading-sm"></span>
        </div>
      </form>
    </div>
  </div>`

const sortHeader = (options: { readonly column: string; readonly label: string; readonly sortBy: string; readonly order: string }): RawHtml =>
  html`<th>
    <button
      class="inline-flex items-center gap-1 font-semibold hover:text-primary"
      hx-get="/partials/coins?sortBy=${options.column}&order=${nextOrder(options.sortBy, options.order, options.column)}"
      hx-include="#coins-filter"
      hx-target="#coins-table-wrap"
      hx-swap="innerHTML"
      hx-indicator="#coins-loading"
      title="Sort by ${options.label}"
    >
      ${options.label}
      <span class="text-xs opacity-60">${sortArrow(options.sortBy, options.order, options.column)}</span>
    </button>
  </th>`

const coinAvatar = (row: CoinStatsRow): RawHtml => {
  const initial = row.symbol.slice(0, 1).toUpperCase()

  return html`<div class="relative h-9 w-9 shrink-0">
    <div class="absolute inset-0 flex items-center justify-center rounded-full bg-neutral font-bold text-neutral-content">
      ${initial}
    </div>
    ${row.logo === ""
      ? ""
      : html`<img
          src="${row.logo}"
          alt=""
          loading="lazy"
          class="absolute inset-0 h-9 w-9 rounded-full object-cover ring-1 ring-base-300"
        />`}
  </div>`
}

/**
 * Renders the coins table wrap (`#coins-table-wrap`) for a filter and page.
 *
 * @param options - Rows, totals, paging, sort, and optional filter for empty states.
 * @returns The table fragment.
 */
export const CoinsTableWrap = (options: {
  readonly rows: ReadonlyArray<CoinStatsRow>
  readonly total: number
  readonly page: number
  readonly pages: number
  readonly sortBy: string
  readonly order: string
  readonly filter?: CoinFilterState | undefined
}): RawHtml => {
  const hasFilter = options.filter === undefined
    ? false
    : options.filter.q.trim() !== "" || options.filter.exchangeId !== "" || options.filter.chainId !== "" ||
      options.filter.flag !== "all"

  return html`<div id="coins-table-wrap">
    <div id="coins-error"></div>
    <div class="mb-2 flex items-center gap-2">
      <span id="coins-count" class="badge badge-neutral">${String(options.total)} coins</span>
      <span class="text-xs opacity-50">20 per page</span>
    </div>
    <div class="card bg-base-100 shadow-sm">
      ${options.rows.length === 0
        ? hasFilter
          ? EmptyState({
            title: "No coins match these filters",
            hint: "Try a different search, or clear the exchange / chain filters.",
            actions: html`<a
                class="btn btn-ghost btn-sm"
                href="/coins"
                hx-get="/coins"
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
                >Clear filters</a
              >
              <button class="btn btn-primary btn-sm" hx-get="/coins/new" hx-target="#modal-slot" hx-swap="innerHTML">
                + New coin
              </button>`
          })
          : EmptyState({
            title: "No coins yet",
            hint: "Create your first coin to start mapping markets and routes.",
            actions: html`<button
              class="btn btn-primary btn-sm"
              hx-get="/coins/new"
              hx-target="#modal-slot"
              hx-swap="innerHTML"
            >
              + New coin
            </button>`
          })
        : html`<div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  ${sortHeader({ column: "symbol", label: "Coin", sortBy: options.sortBy, order: options.order })}
                  <th class="hidden lg:table-cell">Slug</th>
                  <th class="hidden md:table-cell">CoinGecko</th>
                  ${sortHeader({ column: "markets", label: "Markets", sortBy: options.sortBy, order: options.order })}
                  ${sortHeader({ column: "chains", label: "Chains", sortBy: options.sortBy, order: options.order })}
                  ${sortHeader({ column: "blocked", label: "Blocked", sortBy: options.sortBy, order: options.order })}
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="coins-table-body">
                ${join(
                  options.rows.map((row) =>
                    html`<tr id="coin-row-${String(row.id)}" class="hover">
                      <td>
                        <div class="flex items-center gap-3">
                          ${coinAvatar(row)}
                          <div>
                            <div class="font-mono font-bold leading-tight">${row.symbol}</div>
                            <div class="max-w-40 truncate text-xs opacity-60">${row.name}</div>
                          </div>
                        </div>
                      </td>
                      <td class="hidden font-mono text-xs opacity-70 lg:table-cell">${row.slug}</td>
                      <td class="hidden md:table-cell">${String(row.coingeckoId)}</td>
                      <td><span class="badge badge-ghost badge-sm">${String(row.markets)}</span></td>
                      <td><span class="badge badge-ghost badge-sm">${String(row.chains)}</span></td>
                      <td>
                        ${row.blocked > 0
                          ? html`<span class="badge badge-error badge-sm" title="${String(row.blocked)} blocked chain links"
                            >${String(row.blocked)}</span
                          >`
                          : html`<span class="badge badge-success badge-sm" title="All clear">0</span>`}
                      </td>
                      <td>
                        <div class="flex items-center justify-end gap-1">
                          <button
                            class="btn btn-primary btn-xs"
                            hx-get="/partials/coins/${String(row.id)}/drawer"
                            hx-target="#drawer-slot"
                            hx-swap="innerHTML"
                          >
                            Markets
                          </button>
                          <details class="dropdown dropdown-end">
                            <summary class="btn btn-ghost btn-xs" aria-label="More actions for ${row.symbol}">
                              ⋯
                            </summary>
                            <ul class="menu dropdown-content z-30 w-48 rounded-box bg-base-100 p-2 shadow">
                              <li>
                                <button
                                  hx-get="/coins/${String(row.id)}/routes"
                                  hx-target="#main-content"
                                  hx-swap="innerHTML show:top"
                                  hx-push-url="true"
                                >
                                  Transfer routes
                                </button>
                              </li>
                              <li>
                                <button hx-get="/coins/${String(row.id)}/edit" hx-target="#modal-slot" hx-swap="innerHTML">
                                  Edit coin
                                </button>
                              </li>
                              <li>
                                <button
                                  class="text-error"
                                  hx-delete="/coins/${String(row.id)}"
                                  hx-confirm="Delete ${row.symbol} permanently?"
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
                    </tr>`
                  )
                )}
              </tbody>
            </table>
          </div>`}
    </div>
    ${Pagination({
      page: options.page,
      pages: options.pages,
      target: "#coins-table-wrap",
      href: (page) => `/partials/coins?page=${String(page)}`
    })}
  </div>`
}

/**
 * Renders the full coins page body (header, filter, table).
 *
 * @param options - Rows, totals, filter, lists, and paging.
 * @returns The page fragment.
 */
export const CoinsPageBody = (options: {
  readonly rows: ReadonlyArray<CoinStatsRow>
  readonly total: number
  readonly filter: CoinFilterState
  readonly lists: CoinFilterLists
  readonly page: number
  readonly pages: number
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: "Coins",
      subtitle: "Search, filter and sort every coin. Open a coin to manage its exchange markets and chain links.",
      actions: html`<button
        class="btn btn-primary btn-sm"
        hx-get="/coins/new"
        hx-target="#modal-slot"
        hx-swap="innerHTML"
      >
        + New coin
      </button>`
    })}
    ${CoinsFilterBar({ filter: options.filter, lists: options.lists })}
    ${CoinsTableWrap({
      rows: options.rows,
      total: options.total,
      page: options.page,
      pages: options.pages,
      sortBy: options.filter.sortBy,
      order: options.filter.order,
      filter: options.filter
    })}
  </div>`

/**
 * Renders the create/edit coin modal form.
 *
 * @param options - Mode, optional coin, optional error, and form action.
 * @returns The modal fragment.
 */
export const CoinFormFragment = (options: {
  readonly mode: "create" | "edit"
  readonly coin?: { readonly id: number; readonly symbol: string; readonly name: string; readonly slug: string; readonly coingeckoId: string; readonly logo: string } | undefined
  readonly error?: string | undefined
  readonly action: string
}): RawHtml => {
  const isCreate = options.mode === "create"

  return Modal({
    title: isCreate ? "New coin" : "Edit coin",
    subtitle: isCreate
      ? "Coins appear in the table as soon as they are created."
      : "Changes apply immediately to the coins table.",
    error: options.error,
    children: html`<form
      hx-post="${options.action}"
      hx-target="#coins-table-wrap"
      hx-swap="outerHTML"
      hx-indicator="#coin-form-loading"
      hx-disabled-elt="find button[type=submit]"
      class="flex flex-col gap-3"
    >
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-1">
          ${Field({
            label: "Symbol *",
            children: TextInput({ name: "symbol", placeholder: "BTC", required: true, value: options.coin?.symbol ?? "" })
          })}
        </div>
        <div class="col-span-1">
          ${Field({
            label: "CoinGecko id *",
            children: TextInput({
              name: "coingeckoId",
              placeholder: "bitcoin",
              required: true,
              value: options.coin === undefined ? "" : options.coin.coingeckoId
            })
          })}
        </div>
      </div>
      ${Field({ label: "Name", children: TextInput({ name: "name", placeholder: "Bitcoin", value: options.coin?.name ?? "" }) })}
      ${Field({
        label: "Slug",
        hint: "Lowercase URL id — auto-generated from the symbol when empty.",
        children: TextInput({ name: "slug", placeholder: "bitcoin", value: options.coin?.slug ?? "" })
      })}
      ${Field({
        label: "Logo URL",
        children: html`<div class="flex items-center gap-2">
          ${options.coin?.logo
            ? html`<img
                id="coin-logo-preview"
                src="${options.coin.logo}"
                alt=""
                class="h-8 w-8 shrink-0 rounded-full bg-base-200 object-cover ring-1 ring-base-300"
              />`
            : ""}
          ${TextInput({ name: "logo", placeholder: "https://…/logo.png", value: options.coin?.logo ?? "" })}
        </div>`
      })}
      <div class="modal-action mt-1">
        <button type="submit" formmethod="dialog" formnovalidate class="btn btn-ghost btn-sm" aria-label="Cancel and close dialog">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary btn-sm">
          <span id="coin-form-loading" class="htmx-indicator loading loading-spinner loading-xs"></span>
          ${isCreate ? "Create coin" : "Save changes"}
        </button>
      </div>
    </form>`
  })
}
