import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";
import type { CryptocurrencyMetadata } from "../../core/cryptocurrency/cryptocurrency.type";
import { EmptyState } from "./ui";

/** One market inside the drawer — straight from core metadata, no copy. */
export type DrawerMarket = CryptocurrencyMetadata["exchanges"][number];
export type DrawerChainLink = DrawerMarket["chains"][number];

export type DrawerLists = {
  exchanges: Array<{ id: number; name: string }>;
  chains: Array<{ id: number; name: string; code: string }>;
};

const CLOSE_DRAWER_JS = "document.getElementById('drawer-slot').innerHTML=''";

function flagBadge(enabled: boolean, label: string) {
  return enabled ? (
    <span class="badge badge-success badge-sm">{label} on</span>
  ) : (
    <span class="badge badge-error badge-sm">{label} off</span>
  );
}

function ToggleButton({
  linkId,
  flag,
  enabled,
}: {
  linkId: number;
  flag: "withdraw" | "deposit";
  enabled: boolean;
}) {
  return (
    <button
      class={"btn btn-xs " + (enabled ? "btn-success" : "btn-ghost")}
      title={"Toggle " + flag + " (currently " + (enabled ? "on" : "off") + ")"}
      hx-post={"/partials/chain-links/" + String(linkId) + "/toggle?flag=" + flag}
      hx-target="#drawer-body"
      hx-swap="outerHTML"
      hx-indicator="#global-bar"
    >
      {flag} {enabled ? "on" : "off"}
    </button>
  );
}

/** Single chain-link row — stable id so it can be targeted independently. */
export function ChainLinkRow({ link }: { link: DrawerChainLink }) {
  return (
    <li
      id={"chain-link-" + String(link.linkId)}
      class="flex flex-wrap items-center gap-2 rounded-box bg-base-100 p-2 text-sm"
    >
      <span class="font-semibold">{link.name}</span>
      <span class="badge badge-ghost badge-sm font-mono">{link.code}</span>
      <span class="font-mono text-xs opacity-70">{link.exchangeChainCode}</span>
      {flagBadge(link.depositEnabled, "deposit") as unknown as "safe"}
      {flagBadge(link.withdrawEnabled, "withdraw") as unknown as "safe"}
      <span class="ml-auto flex gap-1">
        {ToggleButton({ linkId: link.linkId, flag: "withdraw", enabled: link.withdrawEnabled }) as unknown as "safe"}
        {ToggleButton({ linkId: link.linkId, flag: "deposit", enabled: link.depositEnabled }) as unknown as "safe"}
        <button
          class="btn btn-error btn-outline btn-xs"
          hx-delete={"/partials/chain-links/" + String(link.linkId)}
          hx-confirm={"Remove " + link.name + " from this market?"}
          hx-target="#drawer-body"
          hx-swap="outerHTML"
          hx-indicator="#global-bar"
        >
          Remove
        </button>
      </span>
    </li>
  );
}

/** Single market card — stable id so it can be targeted independently. */
export function MarketCard({
  market,
  chains,
}: {
  market: DrawerMarket;
  chains: DrawerLists["chains"];
}) {
  const formId = "market-form-" + String(market.marketId);
  return (
    <section id={"market-" + String(market.marketId)} class="card bg-base-200 shadow-sm">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="card-title text-base">
            {market.name}
            <span class="font-mono text-sm font-normal opacity-70">
              {market.symbol}
            </span>
          </h3>
          <span class="ml-auto flex flex-wrap gap-1">
            {flagBadge(market.listed, "listed") as unknown as "safe"}
            {flagBadge(market.tradeEnabled, "trade") as unknown as "safe"}
          </span>
        </div>
        <form
          id={formId}
          hx-post={"/partials/markets/" + String(market.marketId) + "/update"}
          hx-target="#drawer-body"
          hx-swap="outerHTML"
          hx-indicator={"#" + formId + "-loading"}
          class="flex flex-wrap items-end gap-2 rounded-box bg-base-100 p-3"
        >
          <label class="form-control min-w-36 flex-1">
            <div class="label py-1">
              <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                Exchange symbol
              </span>
            </div>
            <input
              name="exchangeSymbol"
              value={market.symbol}
              class="input input-bordered input-sm w-full font-mono"
            />
          </label>
          <label class="label cursor-pointer gap-2">
            <span class="label-text text-sm">Listed</span>
            <input
              type="checkbox"
              name="listed"
              checked={market.listed}
              class="toggle toggle-success toggle-sm"
            />
          </label>
          <label class="label cursor-pointer gap-2">
            <span class="label-text text-sm">Trade</span>
            <input
              type="checkbox"
              name="tradeEnabled"
              checked={market.tradeEnabled}
              class="toggle toggle-success toggle-sm"
            />
          </label>
          <span class="flex items-center gap-2">
            <button type="submit" class="btn btn-sm">
              <span id={formId + "-loading"} class="htmx-indicator">
                <span class="loading loading-spinner loading-xs"></span>
              </span>
              Save
            </button>
            <button
              type="button"
              class="btn btn-error btn-outline btn-sm"
              hx-delete={"/partials/markets/" + String(market.marketId)}
              hx-confirm={"Unassign " + market.name + " from this coin?"}
              hx-target="#drawer-body"
              hx-swap="outerHTML"
              hx-indicator="#global-bar"
            >
              Unassign
            </button>
          </span>
        </form>
        {market.chains.length === 0 ? (
          <p class="text-sm opacity-60">No chain links yet — add one below.</p>
        ) : (
          <ul class="flex flex-col gap-2">
            {market.chains.map((link) =>
              (ChainLinkRow({ link }) as unknown as "safe"),
            ) as unknown as "safe"}
          </ul>
        )}
        <form
          hx-post={"/partials/markets/" + String(market.marketId) + "/chains"}
          hx-target="#drawer-body"
          hx-swap="outerHTML"
          hx-indicator="#global-bar"
          class="flex flex-wrap items-end gap-2"
        >
          <label class="form-control min-w-40 flex-1">
            <div class="label py-1">
              <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                Chain
              </span>
            </div>
            <select name="chainId" class="select select-bordered select-sm w-full">
              {chains.map((chain) => (
                <option value={String(chain.id)}>
                  {chain.name} ({chain.code})
                </option>
              )) as unknown as "safe"}
            </select>
          </label>
          <label class="form-control w-40">
            <div class="label py-1">
              <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                Exchange code
              </span>
            </div>
            <input
              name="exchangeChainCode"
              placeholder="ERC20"
              class="input input-bordered input-sm w-full font-mono"
            />
          </label>
          <button type="submit" class="btn btn-sm">
            + Link chain
          </button>
        </form>
      </div>
    </section>
  );
}

/**
 * Drawer body partial (#drawer-body). Every market / chain-link mutation
 * targets this id with outerHTML, so the server always returns exactly
 * this fragment for those endpoints.
 */
export function DrawerBody({
  coinId,
  markets,
  lists,
}: {
  coinId: number;
  markets: DrawerMarket[];
  lists: DrawerLists;
}) {
  return (
    <div id="drawer-body" class="flex flex-col gap-3">
      <div id="drawer-error"></div>
      {markets.length === 0
        ? ((
            <div class="alert alert-info">
              <span class="text-sm">No markets assigned yet.</span>
            </div>
          ) as unknown as "safe")
        : ""}
      {markets.map((market) =>
        (MarketCard({ market, chains: lists.chains }) as unknown as "safe"),
      ) as unknown as "safe"}
      <div class="card bg-base-200 shadow-sm">
        <div class="card-body gap-2 p-4">
          <h3 class="card-title text-base">Assign exchange</h3>
          <form
            hx-post={"/partials/coins/" + String(coinId) + "/markets"}
            hx-target="#drawer-body"
            hx-swap="outerHTML"
            hx-indicator="#global-bar"
            class="flex flex-wrap items-end gap-2"
          >
            <label class="form-control min-w-40 flex-1">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Exchange
                </span>
              </div>
              <select name="exchangeId" class="select select-bordered select-sm w-full">
                {lists.exchanges.map((exchange) => (
                  <option value={String(exchange.id)}>{exchange.name}</option>
                )) as unknown as "safe"}
              </select>
            </label>
            <label class="form-control w-40">
              <div class="label py-1">
                <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
                  Exchange symbol
                </span>
              </div>
              <input
                name="exchangeSymbol"
                placeholder="BTCUSDT"
                class="input input-bordered input-sm w-full font-mono"
              />
            </label>
            <button type="submit" class="btn btn-primary btn-sm">
              Assign
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Full drawer shell (#drawer-slot). Only the open-drawer endpoint returns this. */
export function CoinDrawer({
  metadata,
  lists,
}: {
  metadata: CryptocurrencyMetadata;
  lists: DrawerLists;
}) {
  const chainIds = new Set<number>();
  for (const market of metadata.exchanges) {
    for (const link of market.chains) chainIds.add(link.id);
  }
  return (
    <div id="drawer-slot">
      <div class="drawer drawer-end">
        <input
          id="coin-drawer-toggle"
          type="checkbox"
          class="drawer-toggle"
          checked
        />
        <div class="drawer-side z-50">
          <label
            for="coin-drawer-toggle"
            class="drawer-overlay"
            onclick={CLOSE_DRAWER_JS}
            aria-label="Close drawer"
          ></label>
          <div
            id="coin-drawer"
            role="dialog"
            aria-label={"Coin " + metadata.symbol}
            class="drawer-content flex min-h-full w-full max-w-xl flex-col gap-3 bg-base-100 p-4"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral font-bold text-neutral-content">
                {(metadata.symbol || "?").slice(0, 1).toUpperCase()}
              </div>
              <div class="min-w-0">
                <h2 class="flex flex-wrap items-center gap-2 text-xl font-bold leading-tight">
                  {metadata.name}
                  <span class="badge badge-primary font-mono">
                    {metadata.symbol}
                  </span>
                </h2>
                <p class="truncate font-mono text-xs opacity-60">
                  {metadata.slug} · {String(metadata.exchanges.length)} markets ·{" "}
                  {String(chainIds.size)} chains
                </p>
              </div>
              <button
                type="button"
                class="btn btn-circle btn-ghost btn-sm ml-auto"
                aria-label="Close drawer"
                onclick={CLOSE_DRAWER_JS}
              >
                ✕
              </button>
            </div>
            <div class="divider my-0"></div>
            {DrawerBody({
              coinId: metadata.id,
              markets: metadata.exchanges,
              lists,
            }) as unknown as "safe"}
            <div class="sticky bottom-0 flex gap-2 bg-base-100 py-2">
              <a
                class="btn btn-primary btn-sm flex-1"
                href={"/coins/" + String(metadata.id) + "/routes"}
                hx-get={"/coins/" + String(metadata.id) + "/routes"}
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
                onclick={CLOSE_DRAWER_JS}
              >
                View transfer routes
              </a>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onclick={CLOSE_DRAWER_JS}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export for views that only need an empty result.
export function DrawerEmptyState() {
  return EmptyState({
    title: "No markets assigned",
    hint: "Assign an exchange below to get started.",
  });
}
