import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import { PageHeader } from "./ui";

export type AttentionItem = {
  kind: "unlisted" | "trade-disabled" | "link-disabled" | "under-mapped";
  label: string;
};

function kindBadge(kind: AttentionItem["kind"]): string {
  switch (kind) {
    case "unlisted":
      return "badge-warning";
    case "trade-disabled":
      return "badge-error";
    case "link-disabled":
      return "badge-error";
    case "under-mapped":
      return "badge-info";
  }
}

const KIND_TITLES: Record<AttentionItem["kind"], { title: string; hint: string }> = {
  unlisted: {
    title: "Unlisted markets",
    hint: "Assigned but not listed — flip listed on in the coin drawer.",
  },
  "trade-disabled": {
    title: "Trading disabled",
    hint: "Markets with tradeEnabled off.",
  },
  "link-disabled": {
    title: "Chain links disabled",
    hint: "Deposit or withdraw flags blocking transfers.",
  },
  "under-mapped": {
    title: "Thin coverage",
    hint: "Coins on fewer than two markets can't have transfer routes.",
  },
};

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent: string;
}) {
  return (
    <a
      href={href}
      hx-get={href}
      hx-target="#main-content"
      hx-swap="innerHTML show:top"
      hx-push-url="true"
      class="stat rounded-box bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div class="stat-title">{label}</div>
      <div class={"stat-value text-3xl " + accent}>{String(value)}</div>
      <div class="stat-desc">View all →</div>
    </a>
  );
}

export function DashboardBody({
  counts,
  attention,
}: {
  counts: { coins: number; exchanges: number; chains: number; markets: number };
  attention: AttentionItem[];
}) {
  const groups = (
    Object.keys(KIND_TITLES) as Array<AttentionItem["kind"]>
  )
    .map((kind) => ({
      kind,
      items: attention.filter((item) => item.kind === kind),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div>
      {PageHeader({
        title: "Dashboard",
        subtitle:
          "Coverage at a glance. Everything below updates in place — no full page reloads.",
        actions: (
          <button
            class="btn btn-ghost btn-sm"
            hx-get="/dashboard"
            hx-target="#main-content"
            hx-swap="innerHTML show:top"
            hx-push-url="true"
            hx-indicator="#global-bar"
          >
            ↻ Refresh
          </button>
        ),
      }) as unknown as "safe"}
      <div id="dashboard-counts" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {StatCard({ label: "Coins", value: counts.coins, href: "/coins", accent: "" }) as unknown as "safe"}
        {StatCard({ label: "Exchanges", value: counts.exchanges, href: "/exchanges", accent: "" }) as unknown as "safe"}
        {StatCard({ label: "Chains", value: counts.chains, href: "/chains", accent: "" }) as unknown as "safe"}
        {StatCard({ label: "Market assignments", value: counts.markets, href: "/coins", accent: "text-primary" }) as unknown as "safe"}
      </div>
      <h2 class="mb-2 mt-8 text-lg font-semibold">Needs attention</h2>
      {attention.length === 0 ? (
        <div class="alert alert-success">
          <span>All clear — every market is listed, tradable and linked.</span>
        </div>
      ) : (
        ""
      )}
      <div class="flex flex-col gap-2">
        {groups.map((group) => (
          <details
            class="collapse collapse-arrow rounded-box bg-base-100 shadow-sm"
            open
          >
            <summary class="collapse-title flex items-center gap-2 font-medium">
              <span class={"badge badge-sm " + kindBadge(group.kind)}>
                {String(group.items.length)}
              </span>
              {KIND_TITLES[group.kind].title}
              <span class="hidden text-sm font-normal opacity-60 sm:inline">
                — {KIND_TITLES[group.kind].hint}
              </span>
            </summary>
            <div class="collapse-content">
              <ul
                id={"needs-attention-" + group.kind}
                class="menu gap-1 rounded-box bg-base-200/50 p-2"
              >
                {group.items.map((item) => (
                  <li data-kind={item.kind}>
                    <span class="flex items-center gap-2">
                      <span class={"badge badge-sm " + kindBadge(item.kind)}>
                        {item.kind}
                      </span>
                      <span class="text-sm">{item.label}</span>
                    </span>
                  </li>
                )) as unknown as "safe"}
              </ul>
            </div>
          </details>
        )) as unknown as "safe"}
      </div>
    </div>
  );
}
