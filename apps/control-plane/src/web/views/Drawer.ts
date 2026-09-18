/**
 * Coin drawer: market assignments plus chain links for one coin.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"

/**
 * One market row inside the drawer body.
 */
export type DrawerMarket = {
  readonly marketId: number
  readonly exchangeId: number
  readonly exchangeName: string
  readonly exchangeSymbol: string
  readonly listed: boolean
  readonly tradeEnabled: boolean
  readonly chains: ReadonlyArray<{
    readonly linkId: number
    readonly chainId: number
    readonly chainName: string
    readonly chainCode: string
    readonly exchangeChainCode: string
    readonly withdrawEnabled: boolean
    readonly depositEnabled: boolean
  }>
}

/**
 * Option lists for the drawer assignment forms (top results only).
 */
export type DrawerLists = {
  readonly exchanges: ReadonlyArray<{ readonly id: number; readonly name: string }>
  readonly exchangeTotal: number
  readonly chains: ReadonlyArray<{ readonly id: number; readonly name: string; readonly code: string }>
  readonly chainTotal: number
}

/**
 * Renders the full drawer shell (`#drawer-slot`) for one coin.
 *
 * @param options - Coin identity, markets, and option lists.
 * @returns The drawer fragment.
 */
export const CoinDrawer = (options: {
  readonly coin: { readonly id: number; readonly symbol: string; readonly name: string }
  readonly markets: ReadonlyArray<DrawerMarket>
  readonly lists: DrawerLists
}): RawHtml =>
  html`<div class="drawer drawer-end drawer-open">
      <input id="coin-drawer" type="checkbox" class="drawer-toggle" checked />
      <div class="drawer-side z-40">
        <label for="coin-drawer" class="drawer-overlay" aria-label="Close drawer"></label>
        <div class="min-h-full w-full max-w-xl bg-base-100 p-4 shadow-xl">
          <div class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 class="text-lg font-bold">${options.coin.symbol} <span class="text-sm font-normal opacity-60">${options.coin.name}</span></h2>
              <p class="text-xs opacity-60">Manage exchange markets and chain links. Changes apply immediately.</p>
            </div>
            <button class="btn btn-circle btn-ghost btn-sm" hx-get="/partials/empty" hx-target="#drawer-slot" hx-swap="innerHTML" aria-label="Close drawer">✕</button>
          </div>
          ${DrawerBody({ coinId: options.coin.id, markets: options.markets, lists: options.lists })}
        </div>
      </div>
    </div>`

/**
 * Renders the drawer body (`#drawer-body`) refreshed after every mutation.
 *
 * @param options - Coin id, markets, lists, and optional form errors/values.
 * @returns The drawer-body fragment.
 */
export const DrawerBody = (options: {
  readonly coinId: number
  readonly markets: ReadonlyArray<DrawerMarket>
  readonly lists: DrawerLists
  readonly assignError?: string | undefined
  readonly assignExchangeId?: string | undefined
  readonly assignSymbol?: string | undefined
  readonly assignQuery?: string | undefined
  readonly linkError?: string | undefined
  readonly linkMarketId?: number | undefined
  readonly linkChainId?: string | undefined
  readonly linkCode?: string | undefined
  readonly linkQuery?: string | undefined
}): RawHtml =>
  html`<div id="drawer-body" class="flex flex-col gap-4">
    <div id="drawer-error"></div>
    <section class="card bg-base-200/60 shadow-sm">
      <div class="card-body gap-2 p-4">
        <h3 class="font-semibold">Assign market</h3>
        ${options.assignError === undefined ? "" : html`<div class="alert alert-error my-2" role="alert"><span class="text-sm">${options.assignError}</span></div>`}
        <form hx-post="/partials/coins/${String(options.coinId)}/markets" hx-target="#drawer-body" hx-swap="outerHTML" class="flex flex-wrap items-end gap-2">
          <label class="form-control w-48">
            <div class="label py-1"><span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Exchange</span></div>
            <select name="exchangeId" class="select select-bordered select-sm w-full">
              <option value="">Select…</option>
              ${join(
                options.lists.exchanges.map((exchange) =>
                  html`<option
                    value="${String(exchange.id)}"
                    ${options.assignExchangeId === String(exchange.id) ? "selected" : ""}
                    >${exchange.name}</option
                  >`
                )
              )}
            </select>
            <div class="label py-1"><span class="label-text-alt opacity-60">${String(options.lists.exchanges.length)} of ${String(options.lists.exchangeTotal)} shown</span></div>
          </label>
          <label class="form-control w-40">
            <div class="label py-1"><span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Symbol</span></div>
            <input name="exchangeSymbol" placeholder="BTCUSDT" value="${options.assignSymbol ?? ""}" class="input input-bordered input-sm w-full font-mono" />
          </label>
          <input type="hidden" name="q" value="${options.assignQuery ?? ""}" />
          <button type="submit" class="btn btn-primary btn-sm">Assign</button>
        </form>
      </div>
    </section>
    <section class="flex flex-col gap-2">
      <h3 class="font-semibold">Markets (${String(options.markets.length)})</h3>
      ${options.markets.length === 0
        ? html`<div class="alert alert-info"><span>No markets assigned yet.</span></div>`
        : join(
          options.markets.map((market) =>
            html`<div class="card bg-base-100 shadow-sm" id="market-${String(market.marketId)}">
              <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="font-bold">${market.exchangeName} <span class="font-mono text-sm opacity-70">${market.exchangeSymbol}</span></div>
                  <div class="flex items-center gap-1">
                    <button
                      class="btn btn-ghost btn-xs text-error"
                      hx-delete="/partials/markets/${String(market.marketId)}"
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                      hx-confirm="Unassign ${market.exchangeName}?"
                    >
                      Unassign
                    </button>
                  </div>
                </div>
                <form
                  hx-post="/partials/markets/${String(market.marketId)}/update"
                  hx-target="#drawer-body"
                  hx-swap="outerHTML"
                  class="flex flex-wrap items-center gap-2"
                >
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input type="checkbox" name="listed" class="checkbox checkbox-sm" ${market.listed ? "checked" : ""} />
                    <span class="label-text text-sm">Listed</span>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input type="checkbox" name="tradeEnabled" class="checkbox checkbox-sm" ${market.tradeEnabled ? "checked" : ""} />
                    <span class="label-text text-sm">Trading</span>
                  </label>
                  <input name="exchangeSymbol" value="${market.exchangeSymbol}" class="input input-bordered input-sm w-32 font-mono" />
                  <button type="submit" class="btn btn-ghost btn-xs">Save</button>
                </form>
                <div class="flex flex-col gap-1">
                  <h4 class="text-sm font-semibold opacity-70">Chain links (${String(market.chains.length)})</h4>
                  ${options.linkMarketId === market.marketId && options.linkError !== undefined
                    ? html`<div class="alert alert-error my-1" role="alert"><span class="text-sm">${options.linkError}</span></div>`
                    : ""}
                  ${join(
                    market.chains.map((link) =>
                      html`<div class="flex flex-wrap items-center gap-2 rounded bg-base-200/60 px-2 py-1" id="chain-link-${String(link.linkId)}">
                        <span class="font-mono text-sm font-bold">${link.chainCode}</span>
                        <span class="text-xs opacity-60">${link.exchangeChainCode}</span>
                        <button
                          class="btn btn-ghost btn-xs"
                          hx-post="/partials/chain-links/${String(link.linkId)}/toggle?flag=withdraw"
                          hx-target="#drawer-body"
                          hx-swap="outerHTML"
                          title="Toggle withdraw"
                        >
                          W:${link.withdrawEnabled ? "on" : "off"}
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          hx-post="/partials/chain-links/${String(link.linkId)}/toggle?flag=deposit"
                          hx-target="#drawer-body"
                          hx-swap="outerHTML"
                          title="Toggle deposit"
                        >
                          D:${link.depositEnabled ? "on" : "off"}
                        </button>
                        <button
                          class="btn btn-ghost btn-xs text-error"
                          hx-delete="/partials/chain-links/${String(link.linkId)}"
                          hx-target="#drawer-body"
                          hx-swap="outerHTML"
                        >
                          Remove
                        </button>
                      </div>`
                    )
                  )}
                  <form
                    hx-post="/partials/markets/${String(market.marketId)}/chains"
                    hx-target="#drawer-body"
                    hx-swap="outerHTML"
                    class="flex flex-wrap items-end gap-2"
                  >
                    <label class="form-control w-44">
                      <div class="label py-1"><span class="label-text text-xs opacity-70">Chain</span></div>
                      <select name="chainId" class="select select-bordered select-sm w-full">
                        <option value="">Select…</option>
                        ${join(
                          options.lists.chains.map((chain) =>
                            html`<option
                              value="${String(chain.id)}"
                              ${options.linkMarketId === market.marketId && options.linkChainId === String(chain.id) ? "selected" : ""}
                              >${chain.name} (${chain.code})</option
                            >`
                          )
                        )}
                      </select>
                    </label>
                    <label class="form-control w-32">
                      <div class="label py-1"><span class="label-text text-xs opacity-70">Code</span></div>
                      <input
                        name="exchangeChainCode"
                        placeholder="ERC20"
                        value="${options.linkMarketId === market.marketId ? (options.linkCode ?? "") : ""}"
                        class="input input-bordered input-sm w-full font-mono"
                      />
                    </label>
                    <input type="hidden" name="q" value="${options.linkMarketId === market.marketId ? (options.linkQuery ?? "") : ""}" />
                    <button type="submit" class="btn btn-ghost btn-xs">Link</button>
                  </form>
                </div>
              </div>
            </div>`
          )
        )}
    </section>
  </div>`
