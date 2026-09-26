/**
 * Dashboard page body: coverage counts plus operator attention items.
 *
 * @module
 */

import { html, join, type RawHtml } from "../Html.ts"
import { PageHeader } from "./Controls.ts"

/**
 * One operator attention item grouped by kind on the dashboard.
 */
export type AttentionItem = {
  readonly kind: "unlisted" | "trade-disabled" | "link-disabled" | "under-mapped"
  readonly label: string
}

const kindBadge = (kind: AttentionItem["kind"]): string => {
  switch (kind) {
    case "unlisted":
      return "badge-warning"
    case "trade-disabled":
      return "badge-error"
    case "link-disabled":
      return "badge-error"
    case "under-mapped":
      return "badge-info"
  }
}

const kindTitles: Record<AttentionItem["kind"], { readonly title: string; readonly hint: string }> = {
  unlisted: {
    title: "Unlisted markets",
    hint: "Assigned but not listed — flip listed on in the coin drawer."
  },
  "trade-disabled": {
    title: "Trading disabled",
    hint: "Markets with tradeEnabled off."
  },
  "link-disabled": {
    title: "Chain links disabled",
    hint: "Deposit or withdraw flags blocking transfers."
  },
  "under-mapped": {
    title: "Thin coverage",
    hint: "Coins on fewer than two markets can't have transfer routes."
  }
}

const statCard = (options: {
  readonly label: string
  readonly value: number
  readonly href: string
  readonly accent: string
}): RawHtml =>
  html`<a
    href="${options.href}"
    hx-get="${options.href}"
    hx-target="#main-content"
    hx-swap="innerHTML show:top"
    hx-push-url="true"
    class="stat rounded-box bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
  >
    <div class="stat-title">${options.label}</div>
    <div class="stat-value text-3xl ${options.accent}">${String(options.value)}</div>
    <div class="stat-desc">View all →</div>
  </a>`

/**
 * Renders the dashboard body (counts plus attention groups).
 *
 * @param options - Coverage counts and attention items.
 * @returns The dashboard fragment.
 */
export const DashboardBody = (options: {
  readonly counts: { readonly coins: number; readonly exchanges: number; readonly chains: number; readonly markets: number }
  readonly attention: ReadonlyArray<AttentionItem>
}): RawHtml => {
  const kinds: ReadonlyArray<AttentionItem["kind"]> = ["unlisted", "trade-disabled", "link-disabled", "under-mapped"]

  const groups = kinds.flatMap((kind) => {
    const items = options.attention.filter((item) => item.kind === kind)

    return items.length === 0 ? [] : [{ kind, items }]
  })

  return html`<div>
    ${PageHeader({
      title: "Dashboard",
      subtitle: "Coverage at a glance. Everything below updates in place — no full page reloads.",
      actions: html`<button
        class="btn btn-ghost btn-sm"
        hx-get="/dashboard"
        hx-target="#main-content"
        hx-swap="innerHTML show:top"
        hx-push-url="true"
      >
        ↻ Refresh
      </button>`
    })}
    <div id="dashboard-counts" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${statCard({ label: "Coins", value: options.counts.coins, href: "/coins", accent: "" })}
      ${statCard({ label: "Exchanges", value: options.counts.exchanges, href: "/exchanges", accent: "" })}
      ${statCard({ label: "Chains", value: options.counts.chains, href: "/chains", accent: "" })}
      ${statCard({ label: "Market assignments", value: options.counts.markets, href: "/coins", accent: "text-primary" })}
    </div>
    <h2 class="mb-2 mt-8 text-lg font-semibold">Needs attention</h2>
    ${options.attention.length === 0
      ? html`<div class="alert alert-success"><span>All clear — every market is listed, tradable and linked.</span></div>`
      : ""}
    <div class="flex flex-col gap-2">
      ${join(
        groups.map((group) =>
          html`<details class="collapse collapse-arrow rounded-box bg-base-100 shadow-sm" open>
            <summary class="collapse-title flex items-center gap-2 font-medium">
              <span class="badge badge-sm ${kindBadge(group.kind)}">${String(group.items.length)}</span>
              ${kindTitles[group.kind].title}
              <span class="hidden text-sm font-normal opacity-60 sm:inline">— ${kindTitles[group.kind].hint}</span>
            </summary>
            <div class="collapse-content">
              <ul id="needs-attention-${group.kind}" class="menu gap-1 rounded-box bg-base-200/50 p-2">
                ${join(
                  group.items.map((item) =>
                    html`<li data-kind="${item.kind}">
                      <span class="flex items-center gap-2">
                        <span class="badge badge-sm ${kindBadge(item.kind)}">${item.kind}</span>
                        <span class="text-sm">${item.label}</span>
                      </span>
                    </li>`
                  )
                )}
              </ul>
            </div>
          </details>`
        )
      )}
    </div>
  </div>`
}
