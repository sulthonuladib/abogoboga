import type { ReactNode } from "react"
import { Link } from "react-router"

/**
 * Page title block with optional context and actions.
 *
 * Detail pages pass `back` to give a route back to their listing; the title
 * itself carries the entity name so the browser tab and the page agree.
 */
export const PageHeader = (props: {
  readonly title: ReactNode
  readonly description?: ReactNode | undefined
  readonly actions?: ReactNode | undefined
  readonly back?: { readonly to: string; readonly label: string } | undefined
}) => (
  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div className="min-w-0">
      {props.back === undefined ? null : (
        <Link
          to={props.back.to}
          className="mb-2 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {props.back.label}
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{props.title}</h1>
      {props.description === undefined ? null : (
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{props.description}</p>
      )}
    </div>
    {props.actions === undefined ? null : <div className="flex shrink-0 items-center gap-2">{props.actions}</div>}
  </header>
)
