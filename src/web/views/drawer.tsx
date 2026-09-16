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
      <div id="coin-drawer" role="dialog" aria-label={"Coin " + coin.symbol}>
        <h2>
          {coin.name} ({coin.symbol})
        </h2>
        <div id="drawer-error"></div>
        <div id="drawer-body">
          {markets.length === 0 ? <p>No markets assigned.</p> : ""}
          {markets.map((market) => (
            <section id={"market-" + String(market.marketId)}>
              <h3>
                {market.exchangeName} — {market.exchangeSymbol}
              </h3>
              <p>
                listed: {String(market.listed)} · trade: {String(market.tradeEnabled)}
              </p>
              <form
                hx-post={"/partials/markets/" + String(market.marketId) + "/update"}
                hx-target="#drawer-body"
                hx-swap="outerHTML"
              >
                <input name="exchangeSymbol" value={market.exchangeSymbol} />
                <button type="submit">Update</button>
                <button
                  hx-delete={"/partials/markets/" + String(market.marketId)}
                  hx-target="#drawer-body"
                  hx-swap="outerHTML"
                >
                  Unassign
                </button>
              </form>
              <ul>
                {market.chains.map((link) => (
                  <li id={"chain-link-" + String(link.linkId)}>
                    {link.chainName} ({link.chainCode}) · {link.exchangeChainCode} ·
                    deposit: {String(link.depositEnabled)} · withdraw:{" "}
                    {String(link.withdrawEnabled)}{" "}
                    <button
                      hx-post={
                        "/partials/chain-links/" + String(link.linkId) + "/toggle?flag=withdraw"
                      }
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                    >
                      Toggle withdraw
                    </button>{" "}
                    <button
                      hx-post={
                        "/partials/chain-links/" + String(link.linkId) + "/toggle?flag=deposit"
                      }
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                    >
                      Toggle deposit
                    </button>{" "}
                    <button
                      hx-delete={"/partials/chain-links/" + String(link.linkId)}
                      hx-target="#drawer-body"
                      hx-swap="outerHTML"
                    >
                      Remove
                    </button>
                  </li>
                )) as unknown as "safe"}
              </ul>
              <form
                hx-post={"/partials/markets/" + String(market.marketId) + "/chains"}
                hx-target="#drawer-body"
                hx-swap="outerHTML"
              >
                <select name="chainId">
                  {chains.map((chain) => (
                    <option value={String(chain.id)}>
                      {chain.name} ({chain.code})
                    </option>
                  )) as unknown as "safe"}
                </select>
                <input name="exchangeChainCode" placeholder="exchange chain code" />
                <button type="submit">Add chain link</button>
              </form>
            </section>
          )) as unknown as "safe"}
        </div>
        <h3>Assign exchange</h3>
        <form
          hx-post={"/partials/coins/" + String(coin.id) + "/markets"}
          hx-target="#drawer-body"
          hx-swap="outerHTML"
        >
          <select name="exchangeId">
            {exchanges.map((exchange) => (
              <option value={String(exchange.id)}>{exchange.name}</option>
            )) as unknown as "safe"}
          </select>
          <input name="exchangeSymbol" placeholder="exchange symbol" />
          <button type="submit">Assign</button>
        </form>
        <div>
          <a
            href={"/coins/" + String(coin.id) + "/routes"}
            hx-get={"/coins/" + String(coin.id) + "/routes"}
            hx-target="#main-content"
            hx-swap="innerHTML"
            hx-push-url="true"
          >
            View transfer routes
          </a>{" "}
          <button hx-get="/coins" hx-target="#main-content" hx-swap="innerHTML">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
