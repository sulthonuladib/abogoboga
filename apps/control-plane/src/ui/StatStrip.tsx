import type { ReactNode } from "react"
import { Link } from "react-router"

/**
 * One entry in a {@link StatStrip}.
 */
export type Stat = {
  readonly label: string
  readonly value: ReactNode
  readonly hint?: ReactNode | undefined
  readonly to?: string | undefined
}

/**
 * Hairline grid of headline numbers.
 *
 * Used for coverage and worker summaries: the divider grid keeps the numbers
 * aligned across pages without turning each figure into a card.
 */
export const StatStrip = (props: { readonly stats: ReadonlyArray<Stat> }) => (
  <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-px overflow-hidden rounded-2xl border bg-border">
    {props.stats.map((stat) => (
      <div key={stat.label} className="bg-card px-4 py-3">
        <dt className="text-xs text-muted-foreground">{stat.label}</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">
          {stat.to === undefined ? stat.value : (
            <Link to={stat.to} className="underline-offset-4 hover:underline">
              {stat.value}
            </Link>
          )}
        </dd>
        {stat.hint === undefined ? null : <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>}
      </div>
    ))}
  </dl>
)
