import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lister/ui/components/table"
import { Skeleton } from "@lister/ui/components/skeleton"
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { cn } from "@lister/ui"

/**
 * Table shell and cell helpers.
 *
 * The shared table keeps header typography, cell padding, and numeric
 * alignment consistent; pages supply rows and columns.
 *
 * @module
 */

/** Bordered, horizontally scrollable table container. */
export const DataTable = (props: { readonly children: ReactNode; readonly className?: string }) => (
  <div className={cn("overflow-x-auto rounded-2xl border", props.className)}>
    <Table>{props.children}</Table>
  </div>
)

/** Table header row with the shared column label styling. */
export const Head = (props: { readonly children: ReactNode }) => (
  <TableHeader className="bg-muted/40">
    <TableRow className="hover:bg-transparent">{props.children}</TableRow>
  </TableHeader>
)

/** Table header cell; right-aligned headers match numeric columns. */
export const Th = (props: {
  readonly children?: ReactNode
  readonly align?: "left" | "right"
  readonly className?: string
}) => (
  <TableHead
    className={cn(
      "h-9 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground",
      props.align === "right" ? "text-right" : "text-left",
      props.className
    )}
  >
    {props.children}
  </TableHead>
)

/** Table body cell. */
export const Td = (props: {
  readonly children?: ReactNode
  readonly align?: "left" | "right"
  readonly colSpan?: number
  readonly className?: string
}) => (
  <TableCell
    colSpan={props.colSpan}
    className={cn(
      "px-3 py-2.5 text-sm",
      props.align === "right" && "text-right tabular-nums",
      props.className
    )}
  >
    {props.children}
  </TableCell>
)

/** Body row with the shared hover treatment. */
export const Row = (props: { readonly children: ReactNode }) => (
  <TableRow className="hover:bg-muted/30">{props.children}</TableRow>
)

/** Body with the shared vertical rhythm. */
export const Body = (props: { readonly children: ReactNode }) => (
  <TableBody className="[&_tr:last-child]:border-0">{props.children}</TableBody>
)

/**
 * Placeholder rows while a page loads.
 *
 * @param props - Number of columns and placeholder rows.
 */
export const LoadingRows = (props: { readonly colSpan: number; readonly rows?: number }) => (
  <Body>
    {Array.from({ length: props.rows ?? 4 }, (_, index) => (
      <TableRow key={index} className="hover:bg-transparent">
        <TableCell colSpan={props.colSpan} className="px-3 py-3">
          <Skeleton className="h-4 w-full" />
        </TableCell>
      </TableRow>
    ))}
  </Body>
)

/**
 * Sortable column header.
 *
 * Clicking toggles between ascending and descending; the active column shows
 * a direction caret.
 */
export const SortableTh = (props: {
  readonly label: string
  readonly column: string
  readonly sort: string
  readonly order: "asc" | "desc"
  readonly align?: "left" | "right"
  readonly onSort: (column: string) => void
}) => {
  const active = props.sort === props.column

  return (
    <TableHead
      className={cn(
        "h-9 px-3 text-xs font-medium whitespace-nowrap text-muted-foreground",
        props.align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        type="button"
        onClick={() => props.onSort(props.column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline",
          active && "text-foreground"
        )}
      >
        {props.label}
        {active ? (
          props.order === "asc" ? <CaretUpIcon className="size-3" /> : <CaretDownIcon className="size-3" />
        ) : null}
      </button>
    </TableHead>
  )
}
