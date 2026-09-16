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
        <h1>
          Transfer routes — {coin.name} ({coin.symbol})
        </h1>
        <p>At least two markets are required to render a matrix.</p>
      </div>
    );
  }
  const cellFor = (from: number, to: number) =>
    cells.find((cell) => cell.fromMarketId === from && cell.toMarketId === to);
  return (
    <div>
      <h1>
        Transfer routes — {coin.name} ({coin.symbol})
      </h1>
      <div id="routes-matrix">
        <table>
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
                  if (from.marketId === to.marketId) return <td>—</td>;
                  const cell = cellFor(from.marketId, to.marketId);
                  const status = cell?.status ?? "none";
                  return (
                    <td>
                      <button
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
                        {status}
                      </button>
                    </td>
                  );
                }) as unknown as "safe"}
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
      <div id="route-detail"></div>
    </div>
  );
}

export function RouteDetailFragment({ explanation }: { explanation: string }) {
  return <div id="route-detail">{explanation}</div>;
}
