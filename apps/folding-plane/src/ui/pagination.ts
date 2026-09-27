import type { PaginationMeta } from '@lister/api/client'
import { Array, Match, Option, Order, Result } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'
import { formatCount } from './format'

// PAGE WINDOW

const windowRadius = 1

type PageEntry = number | 'gap'

/**
 * The page numbers a pager shows: the first page, the last page, and the pages
 * around the current one, with a gap standing in for everything between.
 */
const pageWindow = (page: number, pages: number): ReadonlyArray<PageEntry> => {
  const wanted = Array.dedupe([
    1,
    page - windowRadius,
    page,
    page + windowRadius,
    pages,
  ]).filter((candidate) => candidate >= 1 && candidate <= pages)

  const sorted = Array.sort(wanted, Order.Number)

  return Array.filterMap(sorted, (candidate, index) =>
    Result.succeed(
      Option.match(Array.get(sorted, index - 1), {
        onNone: () => candidate,
        onSome: (previous) => candidate - previous > 1 ? 'gap' : candidate,
      }),
    ))
}

// STYLE

const itemClass =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-card px-2 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'

const currentItemClass =
  'bg-primary text-primary-foreground shadow-[var(--shadow-border)] hover:bg-primary hover:shadow-[var(--shadow-border-hover)]'

const disabledItemClass = 'pointer-events-none opacity-40'

// PAGER

type PagerInput<Message> = Readonly<{
  meta: PaginationMeta
  onPage: (page: number) => Message
  h: HtmlBuilder<Message>
}>

/**
 * The controls under a listing. The summary counts rows rather than pages,
 * because that is the figure an operator checks, and the controls move between
 * pages and mark the current one.
 */
export const pagination = <Message>(input: PagerInput<Message>): Html => {
  const { meta, h } = input
  const pages = Math.max(meta.pages, 1)

  return h.div(
    [h.Class('flex flex-wrap items-center justify-between gap-3')],
    [
      h.p([h.Class('text-sm text-muted-foreground')], [summaryText(meta)]),
      h.nav([h.Class('flex items-center gap-1'), h.AriaLabel('Pagination')], [
        stepButton('Previous', meta.page - 1, meta.hasPreviousPage, input),
        ...pageItems(pages, meta.page, input),
        stepButton('Next', meta.page + 1, meta.hasNextPage, input),
      ]),
    ],
  )
}

const summaryText = (meta: PaginationMeta): string =>
  meta.items === 0
    ? 'No rows'
    : `${formatCount(meta.from)}-${formatCount(meta.to)} of ${formatCount(meta.items)}`

const stepButton = <Message>(
  label: string,
  page: number,
  isEnabled: boolean,
  input: PagerInput<Message>,
): Html =>
  input.h.button(
    [
      input.h.Type('button'),
      input.h.AriaLabel(label),
      isEnabled ? input.h.OnClick(input.onPage(page)) : input.h.AriaDisabled(true),
      input.h.Class(classNames(itemClass, isEnabled ? '' : disabledItemClass)),
    ],
    [label],
  )

const pageItems = <Message>(
  pages: number,
  page: number,
  input: PagerInput<Message>,
): ReadonlyArray<Html> =>
  pageWindow(page, pages).map((entry) =>
    Match.value(entry).pipe(
      Match.when('gap', () =>
        input.h.span([input.h.Class('px-1 text-sm text-muted-foreground')], ['…']),
      ),
      Match.orElse((candidate) =>
        input.h.keyed('button')(String(candidate), [
          input.h.Type('button'),
          input.h.OnClick(input.onPage(candidate)),
          input.h.AriaCurrent(candidate === page ? 'page' : 'false'),
          input.h.AriaLabel(`Page ${candidate}`),
          input.h.Class(classNames(itemClass, candidate === page && currentItemClass)),
        ], [formatCount(candidate)]),
      ),
    ))
