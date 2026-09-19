/**
 * Routes-matrix and route-detail views for one coin.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"
import { PageHeader } from "./Controls.ts"

/**
 * One directed route cell between two markets.
 */
export type RouteMatrixCell = {
  readonly fromMarketId: number
  readonly toMarketId: number
  readonly fromExchange: string
  readonly toExchange: string
  readonly status: "full" | "one-way-blocked" | "one-way-other" | "none"
}

const statusBadge = (status: RouteMatrixCell["status"]): RawHtml => {
  switch (status) {
    case "full":
      return html`<span class="badge badge-success badge-sm">full</span>`
    case "one-way-blocked":
      return html`<span class="badge badge-warning badge-sm">one-way blocked</span>`
    case "one-way-other":
      return html`<span class="badge badge-warning badge-sm">one-way</span>`
    case "none":
      return html`<span class="badge badge-error badge-sm">blocked</span>`
  }
}

/**
 * Renders the routes-matrix body for one coin.
 *
 * @param options - Coin, exchanges, and directed cells.
 * @returns The matrix fragment.
 */
export const RoutesMatrixBody = (options: {
  readonly coin: { readonly id: number; readonly symbol: string; readonly name: string }
  readonly exchanges: ReadonlyArray<{ readonly marketId: number; readonly exchangeName: string }>
  readonly cells: ReadonlyArray<RouteMatrixCell>
}): RawHtml =>
  html`<div>
    ${PageHeader({
      title: `Routes ${options.coin.symbol}`,
      subtitle: `${options.coin.name} across ${String(options.exchanges.length)} markets. Green moves both ways.`,
      actions: html`<a
        class="btn btn-ghost btn-sm"
        href="/coins"
        hx-get="/coins"
        hx-target="#main-content"
        hx-swap="innerHTML show:top"
        hx-push-url="true"
        >← Coins</a
      >`
    })}
    <div id="routes-matrix" class="card bg-base-100 shadow-sm"><div class="card-body overflow-x-auto p-4">
      ${options.exchanges.length < 2
        ? html`<div class="alert alert-info"><span>Assign at least two markets to see transfer routes.</span></div>`
        : html`<table class="table table-sm">
            <thead><tr><th>From → To</th>${join(options.exchanges.map((exchange) => html`<th>${exchange.exchangeName}</th>`))}</tr></thead>
            <tbody>
              ${join(
                options.exchanges.map((from) =>
                  html`<tr>
                    <th>${from.exchangeName}</th>
                    ${join(
                      options.exchanges.map((to) => {
                        if (from.marketId === to.marketId) {
                          return html`<td class="opacity-30">—</td>`
                        }

                        const cell = options.cells.find(
                          (candidate) => candidate.fromMarketId === from.marketId && candidate.toMarketId === to.marketId
                        )

                        if (cell === undefined) return html`<td>?</td>`

                        return html`<td>
                          <button
                            class="btn btn-ghost btn-xs"
                            hx-get="/partials/coins/${String(options.coin.id)}/routes/detail?from=${String(from.marketId)}&to=${String(to.marketId)}"
                            hx-target="#modal-slot"
                            hx-swap="innerHTML"
                          >
                            ${statusBadge(cell.status)}
                          </button>
                        </td>`
                      })
                    )}
                  </tr>`
                )
              )}
            </tbody>
          </table>`}
    </div></div>
  </div>`

/**
 * Renders one directed route detail modal.
 *
 * @param options - Coin, endpoints, status, and shared chains.
 * @returns The detail fragment.
 */
export const RouteDetailFragment = (options: {
  readonly coin: { readonly id: number; readonly symbol: string }
  readonly from: string
  readonly to: string
  readonly status: RouteMatrixCell["status"]
  readonly via: ReadonlyArray<string>
}): RawHtml =>
  html`<dialog open id="app-modal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box">
        <h3 class="text-lg font-bold">Route ${options.from} → ${options.to}</h3>
        <p class="mt-1 text-sm opacity-70">Coin ${options.coin.symbol}</p>
        <div class="mt-2">${statusBadge(options.status)}</div>
        ${options.via.length === 0
          ? html`<p class="mt-2 text-sm opacity-70">No shared chain carries value in this direction.</p>`
          : html`<ul class="menu mt-2 gap-1 rounded-box bg-base-200/50 p-2">
              ${join(options.via.map((code) => html`<li><span class="font-mono text-sm">${code}</span></li>`))}
            </ul>`}
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Close dialog">close</button></form>
    </dialog>`
