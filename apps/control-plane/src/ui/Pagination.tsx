import type { PaginationMeta } from "@lister/api/client"
import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@lister/ui/components/pagination"
import { formatCount } from "../lib/format.ts"

/**
 * Page numbers to render for a windowed pager: the first page, the last page,
 * and the pages around the current one, with ellipses between gaps.
 *
 * @param page - Current page.
 * @param pages - Total pages.
 * @returns Page numbers and ellipsis markers in order.
 */
const pageWindow = (page: number, pages: number): ReadonlyArray<number | "ellipsis"> => {
  const wanted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((candidate) => candidate >= 1 && candidate <= pages)
    .sort((left, right) => left - right)

  const window: Array<number | "ellipsis"> = []
  let previous = 0

  for (const candidate of wanted) {
    if (candidate - previous > 1) window.push("ellipsis")

    window.push(candidate)
    previous = candidate
  }

  return window
}

/**
 * Offset pagination controls.
 *
 * The summary states the window in rows, not pages, because operators scan
 * counts; the controls move between pages and mark the current one.
 */
export const Pagination = (props: {
  readonly meta: PaginationMeta
  readonly onPageChange: (page: number) => void
  readonly disabled?: boolean | undefined
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-muted-foreground">
      {props.meta.items === 0
        ? "No rows"
        : `${formatCount(props.meta.from)}–${formatCount(props.meta.to)} of ${formatCount(props.meta.items)}`}
    </p>
    <PaginationRoot className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={props.disabled === true || !props.meta.hasPreviousPage}
            className={props.disabled === true || !props.meta.hasPreviousPage ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault()
              props.onPageChange(props.meta.page - 1)
            }}
          />
        </PaginationItem>
        {pageWindow(props.meta.page, Math.max(props.meta.pages, 1)).map((entry, index) =>
          entry === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <PaginationLink
                href="#"
                isActive={entry === props.meta.page}
                onClick={(event) => {
                  event.preventDefault()
                  props.onPageChange(entry)
                }}
              >
                {formatCount(entry)}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={props.disabled === true || !props.meta.hasNextPage}
            className={props.disabled === true || !props.meta.hasNextPage ? "pointer-events-none opacity-50" : ""}
            onClick={(event) => {
              event.preventDefault()
              props.onPageChange(props.meta.page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  </div>
)
