/**
 * Pure transfer-route helpers. These operate on chain-link flags only, so both
 * the core domain (stats, routers) and the web hypermedia layer import them
 * from here — a single source of truth for "can value move?".
 */
export type ChainLinkFlags = {
  chainId: number;
  withdrawEnabled: boolean;
  depositEnabled: boolean;
};

/** Directed transfer is possible when the source can withdraw on a chain
 * the destination accepts deposits on. */
export function canTransfer(
  srcLinks: Pick<ChainLinkFlags, "chainId" | "withdrawEnabled">[],
  dstLinks: Pick<ChainLinkFlags, "chainId" | "depositEnabled">[],
): boolean {
  return viableChains(srcLinks, dstLinks).length > 0;
}

/** Chains that actually carry value from src to dst (withdraw on src,
 * deposit on dst). */
export function viableChains(
  srcLinks: Pick<ChainLinkFlags, "chainId" | "withdrawEnabled">[],
  dstLinks: Pick<ChainLinkFlags, "chainId" | "depositEnabled">[],
): number[] {
  const dstDeposit = new Set<number>();
  for (const link of dstLinks) {
    if (link.depositEnabled) dstDeposit.add(link.chainId);
  }
  const viable = new Set<number>();
  for (const src of srcLinks) {
    if (src.withdrawEnabled && dstDeposit.has(src.chainId)) {
      viable.add(src.chainId);
    }
  }
  return [...viable];
}

export type RouteStatus = "full" | "one-way-blocked" | "one-way-other" | "none";

export function orderedPairStatus(
  fromLinks: ChainLinkFlags[],
  toLinks: ChainLinkFlags[],
): RouteStatus {
  const fwd = canTransfer(fromLinks, toLinks);
  const bwd = canTransfer(toLinks, fromLinks);
  if (fwd && bwd) return "full";
  if (!fwd && !bwd) return "none";
  // Ordered cell semantics: `one-way-blocked` means this direction is
  // blocked while the reverse works; `one-way-other` is the mirror.
  if (!fwd && bwd) return "one-way-blocked";
  return "one-way-other";
}

export function sharedChainIds(
  aLinks: Pick<ChainLinkFlags, "chainId">[],
  bLinks: Pick<ChainLinkFlags, "chainId">[],
): number[] {
  const bSet = new Set(bLinks.map((link) => link.chainId));
  return [...new Set(aLinks.map((link) => link.chainId))].filter((id) =>
    bSet.has(id),
  );
}

export type MarketFlags = {
  exchangeId: number;
  links: ChainLinkFlags[];
};

/**
 * Is the currency withdrawable from exchange A to exchange B?
 * Optionally restrict to a specific chain X (`viaChainId`).
 * Returns the decision plus the chains that carry the route.
 */
export function isWithdrawable(
  markets: MarketFlags[],
  input: { fromExchangeId: number; toExchangeId: number; viaChainId?: number },
): { ok: boolean; via: number[] } {
  const from = markets.find(
    (market) => market.exchangeId === input.fromExchangeId,
  );
  const to = markets.find(
    (market) => market.exchangeId === input.toExchangeId,
  );
  if (!from || !to) return { ok: false, via: [] };
  const viable = viableChains(from.links, to.links);
  if (input.viaChainId === undefined) {
    return { ok: viable.length > 0, via: viable };
  }
  const ok = viable.includes(input.viaChainId);
  return { ok, via: ok ? [input.viaChainId] : [] };
}
