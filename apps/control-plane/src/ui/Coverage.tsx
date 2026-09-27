import type { CryptocurrencyStat } from "@lister/api/client"
import { Badge } from "@lister/ui/components/badge"
import { WarningCircleIcon } from "@phosphor-icons/react"
import { formatCount } from "../lib/format.ts"

/**
 * Coverage cells for coin listing stats.
 *
 * Rose marks broken and thin routes; healthy coverage stays in the neutral
 * foreground so the eye lands on what needs attention.
 */

/**
 * Blocked-route count: ordered market pairs with no route in either direction.
 */
export const BlockedCell = (props: { readonly blocked: number }) =>
  props.blocked === 0 ? (
    <span className="text-muted-foreground">0</span>
  ) : (
    <span className="inline-flex items-center justify-end gap-1 font-medium text-destructive">
      <WarningCircleIcon className="size-3.5" weight="fill" />
      {formatCount(props.blocked)}
    </span>
  )

/**
 * Market count with a thin-coverage marker for single-market coins.
 */
export const MarketsCell = (props: { readonly markets: number }) =>
  props.markets <= 1 ? (
    <span className="inline-flex items-center justify-end gap-2">
      <Badge variant="outline" className="text-muted-foreground">
        thin
      </Badge>
      <span className="tabular-nums">{formatCount(props.markets)}</span>
    </span>
  ) : (
    <span>{formatCount(props.markets)}</span>
  )

/**
 * One-word health summary used in lists and detail headers.
 *
 * @param stat - Coverage counts for one coin.
 * @returns The health badge, or `null` when coverage is healthy.
 */
export const CoverageBadge = (props: { readonly stat: Pick<CryptocurrencyStat, "markets" | "blocked"> }) => {
  if (props.stat.blocked > 0) {
    return <Badge variant="destructive">blocked routes</Badge>
  }

  if (props.stat.markets <= 1) {
    return <Badge variant="outline">single market</Badge>
  }

  return null
}
