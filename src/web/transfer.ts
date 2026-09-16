export type ChainLinkFlags = {
  chainId: number;
  withdrawEnabled: boolean;
  depositEnabled: boolean;
};

export function canTransfer(
  srcLinks: Pick<ChainLinkFlags, "chainId" | "withdrawEnabled">[],
  dstLinks: Pick<ChainLinkFlags, "chainId" | "depositEnabled">[],
): boolean {
  const dstDeposit = new Set<number>();
  for (const link of dstLinks) {
    if (link.depositEnabled) dstDeposit.add(link.chainId);
  }
  for (const src of srcLinks) {
    if (src.withdrawEnabled && dstDeposit.has(src.chainId)) return true;
  }
  return false;
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
