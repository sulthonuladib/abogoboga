import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { RouteStatus } from "../transfer";

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

export function RoutesMatrixBody({
  coin,
  exchanges,
  cells,
}: {
  coin: { id: number; symbol: string; name: string };
  exchanges: Array<{ marketId: number; exchangeName: string }>;
  cells: RouteMatrixCell[];
}) {
  if (exchanges.length < 2) {
    return (
      <div>
        <h1 class="mb-4 text-2xl font-bold">
          Transfer routes — {coin.name} ({coin.symbol})
        </h1>
        <div class="alert alert-warning">
          <span>At least two markets are required to render a matrix.</span>
        </div>
      </div>
    );
  }
  const cellFor = (from: number, to: number) =>
    cells.find((cell) => cell.fromMarketId === from && cell.toMarketId === to);
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">
        Transfer routes — {coin.name} <span class="badge badge-primary font-mono">{coin.symbol}</span>
      </h1>
      <div id="routes-matrix" class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table w-full table-sm">
          <thead>
            <tr>
              <th>from \ to</th>
              {exchanges.map((exchange) => (
                <th>{exchange.exchangeName}</th>
              )) as unknown as "safe"}
            </tr>
          </thead>
          <tbody>
            {exchanges.map((from) => (
              <tr>
                <th>{from.exchangeName}</th>
                {exchanges.map((to) => {
                  if (from.marketId === to.marketId) return <td class="opacity-40">—</td>;
                  const cell = cellFor(from.marketId, to.marketId);
                  const status = cell?.status ?? "none";
                  return (
                    <td>
                      <button
                        class="btn btn-ghost btn-xs"
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
                      >
                        <span class={"badge badge-sm " + statusBadge(status)}>{status}</span>
                      </button>
                    </td>
                  );
                }) as unknown as "safe"}
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
      <div id="route-detail" class="mt-3"></div>
    </div>
  );
}

export function RouteDetailFragment({ explanation }: { explanation: string }) {
  return (
    <div id="route-detail">
      <div class="alert alert-info">
        <span>{explanation}</span>
      </div>
    </div>
  );
}
