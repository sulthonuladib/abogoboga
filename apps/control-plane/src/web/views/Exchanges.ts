/**
 * Exchanges page, table, form, detail, and option-search views.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"
import { EmptyState, Modal, PageHeader, Pagination, TextInput, Field, Select } from "./Controls.ts"

/**
 * One exchanges-table row with its assigned-coin count.
 */
export type ExchangeRow = {
  readonly id: number
  readonly name: string
  readonly slug: string
  readonly cmcId: number
  readonly baseCurrency: string
  readonly registeredOnCmc: boolean
  readonly coins: number
}

/**
 * Renders the exchanges table wrap (`#exchanges-table-wrap`).
 *
 * @param options - Rows, totals, paging, and search.
 * @returns The table fragment.
 */
export const ExchangesTableWrap = (options: {
  readonly rows: ReadonlyArray<ExchangeRow>
  readonly total: number
  readonly page: number
  readonly pages: number
  readonly q: string
}): RawHtml =>
  html`<div id="exchanges-table-wrap">
    <div id="exchanges-error"></div>
    <div class="mb-2 flex items-center gap-2">
      <span id="exchanges-count" class="badge badge-neutral">${String(options.total)} exchanges</span>
      <span class="text-xs opacity-50">20 per page</span>
    </div>
    <div class="card bg-base-100 shadow-sm">
      ${options.rows.length === 0
        ? EmptyState({
          title: options.q === "" ? "No exchanges yet" : "No exchanges match this search",
          hint: "Create an exchange to start mapping markets.",
          actions: html`<button
            class="btn btn-primary btn-sm"
            hx-get="/exchanges/new"
            hx-target="#modal-slot"
            hx-swap="innerHTML"
          >
            + New exchange
          </button>`
        })
        : html`<div class="overflow-x-auto">
            <table class="table w-full table-sm">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th class="hidden md:table-cell">Slug</th>
                  <th class="hidden md:table-cell">Base</th>
                  <th>Coins</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${join(
                  options.rows.map((row) =>
                    html`<tr id="exchange-row-${String(row.id)}" class="hover">
                      <td>
                        <div class="font-bold">${row.name}</div>
                        <div class="text-xs opacity-60">CMC ${String(row.cmcId)}</div>
                      </td>
                      <td class="hidden font-mono text-xs opacity-70 md:table-cell">${row.slug}</td>
                      <td class="hidden md:table-cell">
                        <span class="badge badge-ghost badge-sm">${row.baseCurrency}</span>
                      </td>
                      <td><span class="badge badge-ghost badge-sm">${String(row.coins)}</span></td>
                      <td>
                        <div class="flex items-center justify-end gap-1">
                          <button
                            class="btn btn-ghost btn-xs"
                            hx-get="/exchanges/${String(row.id)}"
                            hx-target="#main-content"
                            hx-swap="innerHTML show:top"
                            hx-push-url="true"
                          >
                            Detail
                          </button>
                          <button
                            class="btn btn-ghost btn-xs"
                            hx-get="/exchanges/${String(row.id)}/edit"
                            hx-target="#modal-slot"
                            hx-swap="innerHTML"
                          >
                            Edit
                          </button>
                          <button
                            class="btn btn-ghost btn-xs text-error"
                            hx-delete="/exchanges/${String(row.id)}"
                            hx-confirm="Delete ${row.name} permanently?"
                            hx-target="#exchanges-table-wrap"
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
      target: "#exchanges-table-wrap",
      href: (page) => `/partials/exchanges?q=${encodeURIComponent(options.q)}&page=${String(page)}`
    })}
  </div>`

/**
 * Renders the full exchanges page body.
 *
 * @param options - Rows, totals, search, and paging.
 * @returns The page fragment.
 */
export const ExchangesPageBody = (options: {
  readonly rows: ReadonlyArray<ExchangeRow>
  readonly total: number
  readonly q: string
  readonly page: number
  readonly pages: number
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: "Exchanges",
      subtitle: "Every venue a coin can be listed on. Deletes are refused while market assignments exist.",
      actions: html`<button
        class="btn btn-primary btn-sm"
        hx-get="/exchanges/new"
        hx-target="#modal-slot"
        hx-swap="innerHTML"
      >
        + New exchange
      </button>`
    })}
    <form
      id="exchanges-filter"
      hx-get="/partials/exchanges"
      hx-target="#exchanges-table-wrap"
      hx-swap="innerHTML"
      hx-trigger="input changed delay:400ms from:#exchanges-search, change"
      class="mb-4 flex items-end gap-2"
    >
      <label class="form-control w-full max-w-xs">
        <div class="label py-1"><span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Search</span></div>
        <input
          id="exchanges-search"
          name="q"
          type="search"
          placeholder="Binance…"
          value="${options.q}"
          class="input input-sm input-bordered w-full"
          autocomplete="off"
        />
      </label>
    </form>
    ${ExchangesTableWrap({ rows: options.rows, total: options.total, page: options.page, pages: options.pages, q: options.q })}
  </div>`

/**
 * Renders the create/edit exchange modal form.
 *
 * @param options - Mode, optional exchange, optional error, and form action.
 * @returns The modal fragment.
 */
export const ExchangeFormFragment = (options: {
  readonly mode: "create" | "edit"
  readonly exchange?: { readonly id: number; readonly name: string; readonly slug: string; readonly cmcId: number; readonly baseCurrency: string } | undefined
  readonly error?: string | undefined
  readonly action: string
}): RawHtml =>
  Modal({
    title: options.mode === "create" ? "New exchange" : "Edit exchange",
    subtitle: "Exchanges appear in the table as soon as they are saved.",
    error: options.error,
    children: html`<form hx-post="${options.action}" hx-target="#exchanges-table-wrap" hx-swap="outerHTML" class="flex flex-col gap-3">
      ${Field({ label: "Name *", children: TextInput({ name: "name", placeholder: "Binance", required: true, value: options.exchange?.name ?? "" }) })}
      ${Field({ label: "Slug", children: TextInput({ name: "slug", placeholder: "binance", value: options.exchange?.slug ?? "" }) })}
      ${Field({
        label: "CMC id",
        children: TextInput({
          name: "cmcId",
          placeholder: "270",
          value: options.exchange === undefined ? "" : String(options.exchange.cmcId)
        })
      })}
      ${Field({
        label: "Base currency",
        children: Select({
          name: "baseCurrency",
          selected: options.exchange?.baseCurrency ?? "usdt",
          choices: [
            { value: "usdt", label: "USDT" },
            { value: "idr", label: "IDR" }
          ]
        })
      })}
      <div class="modal-action mt-1">
        <button type="submit" formmethod="dialog" formnovalidate class="btn btn-ghost btn-sm">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">${options.mode === "create" ? "Create exchange" : "Save changes"}</button>
      </div>
    </form>`
  })

/**
 * Renders the exchange detail body.
 *
 * @param options - Exchange plus assigned-coin count.
 * @returns The detail fragment.
 */
export const ExchangeDetailBody = (options: {
  readonly exchange: { readonly id: number; readonly name: string; readonly slug: string; readonly cmcId: number; readonly baseCurrency: string; readonly registeredOnCmc: boolean }
  readonly coins: number
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: options.exchange.name,
      subtitle: `Slug ${options.exchange.slug} · CMC ${String(options.exchange.cmcId)} · ${String(options.coins)} coins`,
      actions: html`<button
          class="btn btn-ghost btn-sm"
          hx-get="/exchanges/${String(options.exchange.id)}/edit"
          hx-target="#modal-slot"
          hx-swap="innerHTML"
        >
          Edit
        </button>
        <a class="btn btn-ghost btn-sm" href="/exchanges" hx-get="/exchanges" hx-target="#main-content" hx-swap="innerHTML show:top" hx-push-url="true">← Exchanges</a>`
    })}
    <div class="card bg-base-100 shadow-sm"><div class="card-body">
      <p class="text-sm opacity-70">Base currency <span class="badge badge-ghost badge-sm">${options.exchange.baseCurrency}</span></p>
      <p class="text-sm opacity-70">Registered on CMC: ${options.exchange.registeredOnCmc ? "yes" : "no"}</p>
    </div></div>
  </div>`

/**
 * Renders searchable exchange options for assignment forms.
 *
 * @param options - Options, totals, query, and select wiring.
 * @returns The options fragment.
 */
export const ExchangeOptionsFragment = (options: {
  readonly options: ReadonlyArray<{ readonly id: number; readonly name: string }>
  readonly total: number
  readonly q: string
  readonly targetId: string
  readonly selectName: string
  readonly selectedId?: string | undefined
}): RawHtml =>
  html`<div id="${options.targetId}">
    <select name="${options.selectName}" class="select select-bordered select-sm w-full">
      <option value="">Select exchange…</option>
      ${join(
        options.options.map((option) =>
          html`<option
            value="${String(option.id)}"
            ${options.selectedId === String(option.id) ? "selected" : ""}
            >${option.name}</option
          >`
        )
      )}
    </select>
    <p class="mt-1 text-xs opacity-60">${String(options.options.length)} of ${String(options.total)} shown for “${options.q}”</p>
  </div>`
