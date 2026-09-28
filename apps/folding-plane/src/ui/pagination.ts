import type { PaginationMeta } from '@lister/api/client'
import { Array, Match, Option, Order, Record, Result } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { Nav } from '@foldkit/ui'

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
  toHref: (page: number) => string
  h: HtmlBuilder<Message>
}>

/**
 * The controls under a listing. The summary counts rows rather than pages,
 * because that is the figure an operator checks. Every destination is a link,
 * so a page number can be opened in a new tab, and the current one is marked
 * from the URL's page.
 */
export const pagination = <Message>(input: PagerInput<Message>): Html => {
  const { meta, h } = input
  const pages = Math.max(meta.pages, 1)
  const entries = pageWindow(meta.page, pages)
  const items = entries.filter((entry): entry is number => entry !== 'gap').map((
    page,
  ) => `${page}`)

  return h.div(
    [h.Class('flex flex-wrap items-center justify-between gap-3')],
    [
      h.p([h.Class('text-sm text-muted-foreground')], [summaryText(meta)]),
      Nav.view({
        items,
        ariaLabel: 'Pagination',
        toHref: (value) => input.toHref(Number(value)),
        isItemCurrent: (value) => Number(value) === meta.page,
        toView: ({ nav, items: links }) =>
          h.nav([...nav, h.Class('flex items-center gap-1')], [
            stepControl('Previous', meta.page - 1, meta.hasPreviousPage, input),
            ...pageLinks(entries, links, h),
            stepControl('Next', meta.page + 1, meta.hasNextPage, input),
          ]),
      }),
    ],
  )
}

const summaryText = (meta: PaginationMeta): string =>
  meta.items === 0
    ? 'No rows'
    : `${formatCount(meta.from)}-${formatCount(meta.to)} of ${formatCount(meta.items)}`

const stepControl = <Message>(
  label: string,
  page: number,
  isEnabled: boolean,
  input: PagerInput<Message>,
): Html =>
  isEnabled
    ? input.h.a(
      [
        input.h.Href(input.toHref(page)),
        input.h.AriaLabel(label),
        input.h.Class(itemClass),
      ],
      [label],
    )
    : input.h.span(
      [input.h.Class(classNames(itemClass, disabledItemClass)), input.h.AriaDisabled(true)],
      [label],
    )

const pageLinks = <Message>(
  entries: ReadonlyArray<PageEntry>,
  links: ReadonlyArray<Nav.ItemInfo<string>>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const byPage = Record.fromEntries(links.map((link) => [link.value, link]))

  return entries.map((entry) =>
    Match.value(entry).pipe(
      Match.when('gap', () =>
        h.span([h.Class('px-1 text-sm text-muted-foreground')], ['…'])),
      Match.orElse((page) =>
        Option.match(Record.get(byPage, `${page}`), {
          onNone: () => h.empty,
          onSome: (link) => pageLink(link, h),
        })),
    ))
}

const pageLink = <Message>(link: Nav.ItemInfo<string>, h: HtmlBuilder<Message>): Html =>
  h.keyed('a')(link.value, [
    ...link.link,
    h.AriaLabel(`Page ${link.value}`),
    h.Class(classNames(itemClass, link.isCurrent && currentItemClass)),
  ], [formatCount(Number(link.value))])
