import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type AttentionItem = {
  kind: "unlisted" | "trade-disabled" | "link-disabled" | "under-mapped";
  label: string;
};

export function DashboardBody({
  counts,
  attention,
}: {
  counts: { coins: number; exchanges: number; chains: number; markets: number };
  attention: AttentionItem[];
}) {
  return (
    <div>
      <h1>Dashboard</h1>
      <dl id="dashboard-counts">
        <dt>coins</dt>
        <dd>{String(counts.coins)}</dd>
        <dt>exchanges</dt>
        <dd>{String(counts.exchanges)}</dd>
        <dt>chains</dt>
        <dd>{String(counts.chains)}</dd>
        <dt>market assignments</dt>
        <dd>{String(counts.markets)}</dd>
      </dl>
      <h2>Needs attention</h2>
      <ul id="needs-attention">
        {attention.length === 0 ? <li>All clear.</li> : ""}
        {attention.map((item) => (
          <li data-kind={item.kind}>{item.label}</li>
        )) as unknown as "safe"}
      </ul>
    </div>
  );
}
