/**
 * Pure transfer-route helpers. These operate on chain-link flags only, so the
 * API, the SSR layer, and the stats read model share one source of truth for
 * "can value move?" without depending on persistence.
 *
 * @module
 */

/**
 * Minimal chain-link shape for transfer decisions: which chain the link is on,
 * and whether the market can withdraw from or deposit on it.
 */
export type ChainLinkFlags = {
  readonly chainId: number
  readonly withdrawEnabled: boolean
  readonly depositEnabled: boolean
}

/**
 * Directed transfer is possible when the source can withdraw on a chain the
 * destination accepts deposits on.
 *
 * @param srcLinks - Chain links of the source market.
 * @param dstLinks - Chain links of the destination market.
 * @returns `true` when at least one chain carries value from source to destination.
 */
export function canTransfer(
  srcLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId" | "withdrawEnabled">>,
  dstLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId" | "depositEnabled">>
): boolean {
  return viableChains(srcLinks, dstLinks).length > 0
}

/**
 * Chains that actually carry value from source to destination: withdraw enabled
 * on the source and deposit enabled on the destination.
 *
 * @param srcLinks - Chain links of the source market.
 * @param dstLinks - Chain links of the destination market.
 * @returns The shared chain ids that carry the route, without duplicates.
 */
export function viableChains(
  srcLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId" | "withdrawEnabled">>,
  dstLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId" | "depositEnabled">>
): ReadonlyArray<number> {
  const dstDeposit = new Set<number>()

  for (const link of dstLinks) {
    if (link.depositEnabled) dstDeposit.add(link.chainId)
  }

  const viable = new Set<number>()

  for (const src of srcLinks) {
    if (src.withdrawEnabled && dstDeposit.has(src.chainId)) {
      viable.add(src.chainId)
    }
  }

  return [...viable]
}

/**
 * Ordered route status between two markets.
 *
 * - `full`: value can move in both directions.
 * - `one-way-blocked`: this direction is blocked while the reverse works.
 * - `one-way-other`: the reverse direction is blocked while this one works.
 * - `none`: no direction carries value.
 */
export type RouteStatus = "full" | "one-way-blocked" | "one-way-other" | "none"

/**
 * Compute the ordered route status between two markets.
 *
 * @param fromLinks - Chain links of the source market.
 * @param toLinks - Chain links of the destination market.
 * @returns The ordered route status.
 */
export function orderedPairStatus(
  fromLinks: ReadonlyArray<ChainLinkFlags>,
  toLinks: ReadonlyArray<ChainLinkFlags>
): RouteStatus {
  const forward = canTransfer(fromLinks, toLinks)
  const backward = canTransfer(toLinks, fromLinks)

  if (forward && backward) return "full"

  if (!forward && !backward) return "none"

  if (!forward && backward) return "one-way-blocked"

  return "one-way-other"
}

/**
 * Chain ids that appear in both link sets, without duplicates.
 *
 * @param aLinks - First chain-link set.
 * @param bLinks - Second chain-link set.
 * @returns The shared chain ids.
 */
export function sharedChainIds(
  aLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId">>,
  bLinks: ReadonlyArray<Pick<ChainLinkFlags, "chainId">>
): ReadonlyArray<number> {
  const bSet = new Set(bLinks.map((link) => link.chainId))

  return [...new Set(aLinks.map((link) => link.chainId))].filter((id) => bSet.has(id))
}

/**
 * Market shape used by transfer decisions: the exchange plus its chain links.
 */
export type MarketFlags = {
  readonly exchangeId: number
  readonly links: ReadonlyArray<ChainLinkFlags>
}

/**
 * Result of a directed transfer decision.
 */
export type TransferDecision = {
  readonly ok: boolean
  readonly via: ReadonlyArray<number>
}

/**
 * Is the currency withdrawable from exchange A to exchange B?
 * Optionally restrict the route to a specific chain.
 *
 * @param markets - Markets holding the currency.
 * @param input - Source, destination, and optional chain restriction.
 * @returns The decision plus the chains that carry the route.
 */
export function isWithdrawable(
  markets: ReadonlyArray<MarketFlags>,
  input: { readonly fromExchangeId: number; readonly toExchangeId: number; readonly viaChainId?: number }
): TransferDecision {
  const from = markets.find((market) => market.exchangeId === input.fromExchangeId)
  const to = markets.find((market) => market.exchangeId === input.toExchangeId)

  if (!from || !to) return { ok: false, via: [] }

  const viable = viableChains(from.links, to.links)

  if (input.viaChainId === undefined) {
    return { ok: viable.length > 0, via: viable }
  }

  const ok = viable.includes(input.viaChainId)

  return { ok, via: ok ? [input.viaChainId] : [] }
}
