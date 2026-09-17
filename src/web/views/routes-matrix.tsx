import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { RouteStatus } from "../../core/cryptocurrency/transfer";
import { InlineLoading, PageHeader } from "./ui";

export type RouteMatrixCell = {
  fromMarketId: number;
  toMarketId: number;
  fromExchange: string;
  toExchange: string;
  status: RouteStatus;
};

function statusBadge(status: RouteStatus): string {
  switch (status) {
    case "full":
      return "badge-success";
    case "none":
      return "badge-error";
    case "one-way-blocked":
    case "one-way-other":
      return "badge-warning";
  }
}

const STATUS_LEGEND: Array<{ status: RouteStatus; hint: string }> = [
  { status: "full", hint: "both directions work" },
  { status: "one-way-blocked", hint: "this direction blocked, reverse works" },
  { status: "one-way-other", hint: "this direction works, reverse blocked" },
  { status: "none", hint: "no shared enabled chain" },
];

export function RoutesMatrixBody({
  coin,
  exchanges,
  cells,
}: {
  coin: { id: number; symbol: string; name: string };
  exchanges: Array<{ marketId: number; exchangeName: string }>;
  cells: RouteMatrixCell[];
}) {
  return (
    <div>
      {PageHeader({
        title: "Transfer routes",
        subtitle:
          "Click any cell to see exactly which chains carry " +
          coin.symbol +
          " between two exchanges.",
        crumbs: [
          { label: "Coins", href: "/coins" },
          { label: coin.symbol + " · " + coin.name },
          { label: "Routes" },
        ],
        actions: (
          <button
            class="btn btn-ghost btn-sm"
            hx-get={"/partials/coins/" + String(coin.id) + "/drawer"}
            hx-target="#drawer-slot"
            hx-swap="innerHTML"
          >
            ← Back to {coin.symbol} markets
          </button>
        ),
      }) as unknown as "safe"}
      {exchanges.length < 2 ? (
        <div class="card bg-base-100 shadow-sm">
          <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p class="font-semibold">Not enough markets for routes</p>
            <p class="text-sm opacity-60">
              At least two markets are required to render a matrix for {coin.symbol}.
              Assign another market to unlock transfer routes.
            </p>
            <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                class="btn btn-primary btn-sm"
                hx-get={"/partials/coins/" + String(coin.id) + "/drawer"}
                hx-target="#drawer-slot"
                hx-swap="innerHTML"
              >
                Assign market
              </button>
              <a
                class="btn btn-ghost btn-sm"
                href="/coins"
                hx-get="/coins"
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
              >
                ← Back to Coins
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            {STATUS_LEGEND.map((entry) => (
              <span class="flex items-center gap-1 text-xs opacity-80">
                <span class={"badge badge-sm " + statusBadge(entry.status)}>
                  {entry.status}
                </span>
                {entry.hint}
              </span>
            )) as unknown as "safe"}
          </div>
          <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div
              id="routes-matrix"
              class="card overflow-x-auto bg-base-100 shadow-sm"
            >
              <table class="table w-full table-sm">
                <thead>
                  <tr>
                    <th class="sticky left-0 bg-base-100">from ╲ to</th>
                    {exchanges.map((exchange) => (
                      <th class="whitespace-nowrap">{exchange.exchangeName}</th>
                    )) as unknown as "safe"}
                  </tr>
                </thead>
                <tbody>
                  {exchanges.map((from) => (
                    <tr class="hover">
                      <th class="sticky left-0 whitespace-nowrap bg-base-100">
                        {from.exchangeName}
                      </th>
                      {exchanges.map((to) => {
                        if (from.marketId === to.marketId)
                          return <td class="opacity-40">—</td>;
                        const cell = cells.find(
                          (candidate) =>
                            candidate.fromMarketId === from.marketId &&
                            candidate.toMarketId === to.marketId,
                        );
                        const status = cell?.status ?? "none";
                        return (
                          <td>
                            <button
                              class="btn btn-ghost btn-xs"
                              title={
                                from.exchangeName + " → " + to.exchangeName + ": " + status
                              }
                              hx-get={
                                "/partials/coins/" +
                                String(coin.id) +
                                "/routes/detail?from=" +
                                String(from.marketId) +
                                "&to=" +
                                String(to.marketId)
                              }
                              hx-target="#route-detail"
                              hx-swap="innerHTML"
                              hx-indicator="#route-loading"
                            >
                              <span class={"badge badge-sm " + statusBadge(status)}>
                                {status}
                              </span>
                            </button>
                          </td>
                        );
                      }) as unknown as "safe"}
                    </tr>
                  )) as unknown as "safe"}
                </tbody>
              </table>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold uppercase tracking-wide opacity-70">
                  Route detail
                </h2>
                {InlineLoading({ id: "route-loading" }) as unknown as "safe"}
              </div>
              <div id="route-detail">
                <div class="rounded-box border border-dashed border-base-300 p-4 text-sm opacity-60">
                  Select a cell to inspect its chains.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RouteDetailFragment({
  from,
  to,
  status,
  explanation,
  shared,
}: {
  from: string;
  to: string;
  status: RouteStatus;
  explanation: string;
  shared: string[];
}) {
  return (
    <div id="route-detail" class="card bg-base-100 shadow-sm">
      <div class="card-body gap-2 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-sm font-bold">
            {from} → {to}
          </span>
          <span class={"badge badge-sm " + statusBadge(status)}>{status}</span>
        </div>
        <p class="text-sm">{explanation}</p>
        {shared.length > 0 ? (
          <div>
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
              Shared chains
            </p>
            <div class="flex flex-wrap gap-1">
              {shared.map((name) => (
                <span class="badge badge-ghost badge-sm font-mono">{name}</span>
              )) as unknown as "safe"}
            </div>
          </div>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}
