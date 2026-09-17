import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type DrawerMarket = {
  marketId: number;
  exchangeId: number;
  exchangeName: string;
  exchangeSymbol: string;
  listed: boolean;
  tradeEnabled: boolean;
  chains: Array<{
    linkId: number;
    chainId: number;
    chainName: string;
    chainCode: string;
    exchangeChainCode: string;
    depositEnabled: boolean;
    withdrawEnabled: boolean;
  }>;
};

function flagBadge(enabled: boolean, label: string) {
  return enabled ? (
    <span class="badge badge-success badge-sm">{label} on</span>
  ) : (
    <span class="badge badge-error badge-sm">{label} off</span>
  );
}

export function CoinDrawer({
  coin,
  markets,
  exchanges,
  chains,
}: {
  coin: { id: number; symbol: string; name: string; slug: string };
  markets: DrawerMarket[];
  exchanges: Array<{ id: number; name: string }>;
  chains: Array<{ id: number; name: string; code: string }>;
}) {
  return (
    <div id="drawer-slot">
      <div class="drawer drawer-end">
        <input id="coin-drawer-toggle" type="checkbox" class="drawer-toggle" checked />
        <div class="drawer-side">
          <label for="coin-drawer-toggle" class="drawer-overlay" hx-get="/coins" hx-target="#main-content" hx-swap="innerHTML"></label>
          <div id="coin-drawer" role="dialog" aria-label={"Coin " + coin.symbol} class="drawer-content flex min-h-full w-full max-w-xl flex-col gap-3 bg-base-100 p-4">
            <h2 class="text-xl font-bold">
              {coin.name} <span class="badge badge-primary font-mono">{coin.symbol}</span>
            </h2>
            <div id="drawer-error"></div>
            <div id="drawer-body" class="flex flex-col gap-3">
              {markets.length === 0 ? (
                <div class="alert alert-info"><span>No markets assigned.</span></div>
              ) : (
                ""
              )}
              {markets.map((market) => (
                <section id={"market-" + String(market.marketId)} class="card bg-base-200 shadow-sm">
                  <div class="card-body gap-2 p-4">
                    <h3 class="card-title text-base">
                      {market.exchangeName} <span class="font-mono text-sm opacity-70">— {market.exchangeSymbol}</span>
                    </h3>
                    <p class="flex flex-wrap gap-1">
                      {flagBadge(market.listed, "listed") as unknown as "safe"}
                      {flagBadge(market.tradeEnabled, "trade") as unknown as "safe"}
                    </p>
                    <form
                      class="flex flex-wrap gap-2"
                      hx-post={"/partials/markets/" + String(market.marketId) + "/update"}
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                    >
                      <input name="exchangeSymbol" value={market.exchangeSymbol} class="input input-bordered input-sm grow" />
                      <button type="submit" class="btn btn-sm">Update</button>
                      <button
                        class="btn btn-error btn-outline btn-sm"
                        hx-delete={"/partials/markets/" + String(market.marketId)}
                        hx-target="#drawer-body"
                        hx-swap="outerHTML"
                      >
                        Unassign
                      </button>
                    </form>
                    <ul class="flex flex-col gap-2">
                      {market.chains.map((link) => (
                        <li id={"chain-link-" + String(link.linkId)} class="flex flex-wrap items-center gap-2 rounded-box bg-base-100 p-2 text-sm">
                          <span class="font-semibold">{link.chainName}</span>
                          <span class="badge badge-ghost font-mono">{link.chainCode}</span>
                          <span class="font-mono text-xs opacity-70">{link.exchangeChainCode}</span>
                          {flagBadge(link.depositEnabled, "deposit") as unknown as "safe"}
                          {flagBadge(link.withdrawEnabled, "withdraw") as unknown as "safe"}
                          <span class="flex gap-1">
                            <button
                              class="btn btn-ghost btn-xs"
                              hx-post={
                                "/partials/chain-links/" + String(link.linkId) + "/toggle?flag=withdraw"
                              }
                              hx-target="#drawer-body"
                              hx-swap="outerHTML"
                            >
                              Toggle withdraw
                            </button>
                            <button
                              class="btn btn-ghost btn-xs"
                              hx-post={
                                "/partials/chain-links/" + String(link.linkId) + "/toggle?flag=deposit"
                              }
                              hx-target="#drawer-body"
                              hx-swap="outerHTML"
                            >
                              Toggle deposit
                            </button>
                            <button
                              class="btn btn-error btn-outline btn-xs"
                              hx-delete={"/partials/chain-links/" + String(link.linkId)}
                              hx-target="#drawer-body"
                              hx-swap="outerHTML"
                            >
                              Remove
                            </button>
                          </span>
                        </li>
                      )) as unknown as "safe"}
                    </ul>
                    <form
                      class="flex flex-wrap gap-2"
                      hx-post={"/partials/markets/" + String(market.marketId) + "/chains"}
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                    >
                      <select name="chainId" class="select select-bordered select-sm">
                        {chains.map((chain) => (
                          <option value={String(chain.id)}>
                            {chain.name} ({chain.code})
                          </option>
                        )) as unknown as "safe"}
                      </select>
                      <input name="exchangeChainCode" placeholder="exchange chain code" class="input input-bordered input-sm" />
                      <button type="submit" class="btn btn-sm">Add chain link</button>
                    </form>
                  </div>
                </section>
              )) as unknown as "safe"}
            </div>
            <div class="card bg-base-200 shadow-sm">
              <div class="card-body gap-2 p-4">
                <h3 class="card-title text-base">Assign exchange</h3>
                <form
                  class="flex flex-wrap gap-2"
                  hx-post={"/partials/coins/" + String(coin.id) + "/markets"}
                  hx-target="#drawer-body"
                  hx-swap="outerHTML"
                >
                  <select name="exchangeId" class="select select-bordered select-sm">
                    {exchanges.map((exchange) => (
                      <option value={String(exchange.id)}>{exchange.name}</option>
                    )) as unknown as "safe"}
                  </select>
                  <input name="exchangeSymbol" placeholder="exchange symbol" class="input input-bordered input-sm" />
                  <button type="submit" class="btn btn-primary btn-sm">Assign</button>
                </form>
              </div>
            </div>
            <div class="flex gap-2">
              <a
                class="btn btn-primary btn-sm"
                href={"/coins/" + String(coin.id) + "/routes"}
                hx-get={"/coins/" + String(coin.id) + "/routes"}
                hx-target="#main-content"
                hx-swap="innerHTML"
                hx-push-url="true"
              >
                View transfer routes
              </a>
              <button class="btn btn-ghost btn-sm" hx-get="/coins" hx-target="#main-content" hx-swap="innerHTML">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
