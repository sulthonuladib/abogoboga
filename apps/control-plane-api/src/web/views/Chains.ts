/**
 * Chains page, table, form, detail, and option-search views.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"
import { EmptyState, Modal, PageHeader, Pagination, TextInput, Field } from "./Controls.ts"

/**
 * One chains-table row with its linked-coin count.
 */
export type ChainRow = {
  readonly id: number
  readonly name: string
  readonly code: string
  readonly coins: number
}

/**
 * Renders the chains table wrap (`#chains-table-wrap`).
 *
 * @param options - Rows, totals, paging, and search.
 * @returns The table fragment.
 */
export const ChainsTableWrap = (options: {
  readonly rows: ReadonlyArray<ChainRow>
  readonly total: number
  readonly page: number
  readonly pages: number
  readonly q: string
}): RawHtml =>
  html`<div id="chains-table-wrap">
    <div id="chains-error"></div>
    <div class="mb-2 flex items-center gap-2">
      <span id="chains-count" class="badge badge-neutral">${String(options.total)} chains</span>
      <span class="text-xs opacity-50">20 per page</span>
    </div>
    <div class="card bg-base-100 shadow-sm">
      ${options.rows.length === 0
        ? EmptyState({
          title: options.q === "" ? "No chains yet" : "No chains match this search",
          hint: "Create a chain to start linking markets to networks.",
          actions: html`<button
            class="btn btn-primary btn-sm"
            hx-get="/chains/new"
            hx-target="#modal-slot"
            hx-swap="innerHTML"
          >
            + New chain
          </button>`
        })
        : html`<div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Code</th>
                  <th>Coins</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${join(
                  options.rows.map((row) =>
                    html`<tr id="chain-row-${String(row.id)}" class="hover">
                      <td><div class="font-bold">${row.name}</div></td>
                      <td><span class="badge badge-ghost badge-sm font-mono">${row.code}</span></td>
                      <td><span class="badge badge-ghost badge-sm">${String(row.coins)}</span></td>
                      <td>
                        <div class="flex items-center justify-end gap-1">
                          <button
                            class="btn btn-ghost btn-xs"
                            hx-get="/chains/${String(row.id)}"
                            hx-target="#main-content"
                            hx-swap="innerHTML show:top"
                            hx-push-url="true"
                          >
                            Detail
                          </button>
                          <button
                            class="btn btn-ghost btn-xs"
                            hx-get="/chains/${String(row.id)}/edit"
                            hx-target="#modal-slot"
                            hx-swap="innerHTML"
                          >
                            Edit
                          </button>
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            hx-delete="/chains/${String(row.id)}"
                            hx-confirm="Delete ${row.name} permanently?"
                            hx-target="#chains-table-wrap"
                            hx-swap="outerHTML"
                          >
                            Delete
                          </button>
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
      target: "#chains-table-wrap",
      href: (page) => `/partials/chains?q=${encodeURIComponent(options.q)}&page=${String(page)}`
    })}
  </div>`

/**
 * Renders the full chains page body.
 *
 * @param options - Rows, totals, search, and paging.
 * @returns The page fragment.
 */
export const ChainsPageBody = (options: {
  readonly rows: ReadonlyArray<ChainRow>
  readonly total: number
  readonly q: string
  readonly page: number
  readonly pages: number
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: "Chains",
      subtitle: "Networks markets settle on. Deletes are refused while chain links reference the chain.",
      actions: html`<button
        class="btn btn-primary btn-sm"
        hx-get="/chains/new"
        hx-target="#modal-slot"
        hx-swap="innerHTML"
      >
        + New chain
      </button>`
    })}
    <form
      id="chains-filter"
      hx-get="/partials/chains"
      hx-target="#chains-table-wrap"
      hx-swap="innerHTML"
      hx-trigger="input changed delay:400ms from:#chains-search, change"
      class="mb-4 flex items-end gap-2"
    >
      <label class="form-control w-full max-w-xs">
        <div class="label py-1"><span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Search</span></div>
        <input
          id="chains-search"
          name="q"
          type="search"
          placeholder="Ethereum…"
          value="${options.q}"
          class="input input-sm input-bordered w-full"
          autocomplete="off"
        />
      </label>
    </form>
    ${ChainsTableWrap({ rows: options.rows, total: options.total, page: options.page, pages: options.pages, q: options.q })}
  </div>`

/**
 * Renders the create/edit chain modal form.
 *
 * @param options - Mode, optional chain, optional error, and form action.
 * @returns The modal fragment.
 */
export const ChainFormFragment = (options: {
  readonly mode: "create" | "edit"
  readonly chain?: { readonly id: number; readonly name: string; readonly code: string } | undefined
  readonly error?: string | undefined
  readonly action: string
}): RawHtml =>
  Modal({
    title: options.mode === "create" ? "New chain" : "Edit chain",
    subtitle: "Chains appear in the table as soon as they are saved.",
    error: options.error,
    children: html`<form hx-post="${options.action}" hx-target="#chains-table-wrap" hx-swap="outerHTML" class="flex flex-col gap-3">
      ${Field({ label: "Name *", children: TextInput({ name: "name", placeholder: "Ethereum", required: true, value: options.chain?.name ?? "" }) })}
      ${Field({ label: "Code *", children: TextInput({ name: "code", placeholder: "ETH", required: true, value: options.chain?.code ?? "" }) })}
      <div class="modal-action mt-1">
        <button type="submit" formmethod="dialog" formnovalidate class="btn btn-ghost btn-sm">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">${options.mode === "create" ? "Create chain" : "Save changes"}</button>
      </div>
    </form>`
  })

/**
 * Renders the chain detail body.
 *
 * @param options - Chain plus linked-coin count.
 * @returns The detail fragment.
 */
export const ChainDetailBody = (options: {
  readonly chain: { readonly id: number; readonly name: string; readonly code: string }
  readonly coins: number
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: options.chain.name,
      subtitle: `Code ${options.chain.code} · ${String(options.coins)} coins`,
      actions: html`<button
          class="btn btn-ghost btn-sm"
          hx-get="/chains/${String(options.chain.id)}/edit"
          hx-target="#modal-slot"
          hx-swap="innerHTML"
        >
          Edit
        </button>
        <a class="btn btn-ghost btn-sm" href="/chains" hx-get="/chains" hx-target="#main-content" hx-swap="innerHTML show:top" hx-push-url="true">← Chains</a>`
    })}
    <div class="card bg-base-100 shadow-sm"><div class="card-body">
      <p class="text-sm opacity-70">Code <span class="badge badge-ghost badge-sm font-mono">${options.chain.code}</span></p>
    </div></div>
  </div>`

/**
 * Renders searchable chain options for chain-link forms.
 *
 * @param options - Options, totals, query, and select wiring.
 * @returns The options fragment.
 */
export const ChainOptionsFragment = (options: {
  readonly options: ReadonlyArray<{ readonly id: number; readonly name: string; readonly code: string }>
  readonly total: number
  readonly q: string
  readonly targetId: string
  readonly selectName: string
  readonly selectedId?: string | undefined
}): RawHtml =>
  html`<div id="${options.targetId}">
    <select name="${options.selectName}" class="select select-bordered select-sm w-full">
      <option value="">Select chain…</option>
      ${join(
        options.options.map((option) =>
          html`<option
            value="${String(option.id)}"
            ${options.selectedId === String(option.id) ? "selected" : ""}
            >${option.name} (${option.code})</option
          >`
        )
      )}
    </select>
    <p class="mt-1 text-xs opacity-60">${String(options.options.length)} of ${String(options.total)} shown for “${options.q}”</p>
  </div>`
