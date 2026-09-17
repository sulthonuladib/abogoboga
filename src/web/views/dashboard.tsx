import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

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

export function DashboardBody({
  counts,
  attention,
}: {
  counts: { coins: number; exchanges: number; chains: number; markets: number };
  attention: AttentionItem[];
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">Dashboard</h1>
      <div id="dashboard-counts" class="stats stats-vertical w-full shadow sm:stats-horizontal">
        <div class="stat">
          <div class="stat-title">coins</div>
          <div class="stat-value text-2xl">{String(counts.coins)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">exchanges</div>
          <div class="stat-value text-2xl">{String(counts.exchanges)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">chains</div>
          <div class="stat-value text-2xl">{String(counts.chains)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">market assignments</div>
          <div class="stat-value text-2xl">{String(counts.markets)}</div>
        </div>
      </div>
      <h2 class="mb-2 mt-6 text-lg font-semibold">Needs attention</h2>
      {attention.length === 0 ? (
        <div class="alert alert-success">
          <span>All clear.</span>
        </div>
      ) : (
        ""
      )}
      <ul id="needs-attention" class="menu gap-1 rounded-box bg-base-100 p-2 shadow-sm">
        {attention.map((item) => (
          <li data-kind={item.kind}>
            <span class="flex items-center gap-2">
              <span class={"badge badge-sm " + kindBadge(item.kind)}>{item.kind}</span>
              <span>{item.label}</span>
            </span>
          </li>
        )) as unknown as "safe"}
      </ul>
    </div>
  );
}
