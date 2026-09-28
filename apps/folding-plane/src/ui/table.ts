import { Array } from 'effect'
import { Button } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// STYLE

const tableClass = 'w-full border-collapse text-sm'

const headCellClass =
  'h-9 px-3 text-xs font-medium whitespace-nowrap text-left text-muted-foreground'

const bodyCellClass = 'px-3 py-2.5 align-middle'

const numericClass = 'text-right tabular-nums'

const rowClass =
  'border-b border-border transition-[background-color] duration-[var(--duration-instant)] ease-[var(--ease-app)] last:border-0 hover:bg-muted/40'

const placeholderRows = 4

// TABLE

/**
 * A bordered, horizontally scrollable table. The caller supplies the head and
 * body so a page decides its own columns.
 */
export const table = <Message>(
  h: HtmlBuilder<Message>,
  content: ReadonlyArray<Html>,
): Html =>
  h.div(
    [h.Class('overflow-x-auto rounded-2xl bg-card shadow-[var(--shadow-border)]')],
    [h.table([h.Class(tableClass)], content)],
  )

export const head = <Message>(
  h: HtmlBuilder<Message>,
  columns: ReadonlyArray<Html>,
): Html => h.thead([h.Class('bg-muted/50')], [h.tr([h.Class('hover:bg-transparent')], columns)])

export const body = <Message>(
  h: HtmlBuilder<Message>,
  rows: ReadonlyArray<Html>,
): Html => h.tbody([h.Class('[&_tr:last-child]:border-0')], rows)

export const row = <Message>(
  h: HtmlBuilder<Message>,
  cells: ReadonlyArray<Html>,
): Html => h.tr([h.Class(rowClass)], cells)

// HEADER

export const th = <Message>(
  label: string,
  h: HtmlBuilder<Message>,
  isNumeric?: boolean | undefined,
): Html =>
  h.th(
    [
      h.Scope('col'),
      h.Class(classNames(headCellClass, isNumeric === true && 'text-right')),
    ],
    [label],
  )

/**
 * A header that sorts its column. The cell carries the direction, so the
 * table's state is announced without reading every button in it.
 */
export const sortableTh = <Message, Sort extends string>(
  input: Readonly<{
    label: string
    column: Sort
    sort: Sort
    order: 'asc' | 'desc'
    isNumeric?: boolean | undefined
    onSort: (column: Sort) => Message
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const { h } = input

  const isActive = input.sort === input.column
  const direction = isActive ? input.order : 'none'
  const state = isActive ? (input.order === 'asc' ? 'ascending' : 'descending') : 'not sorted'

  return h.th(
    [
      h.Scope('col'),
      h.AriaSort(direction),
      h.Class(classNames(headCellClass, input.isNumeric === true && 'text-right')),
    ],
    [
      Button.view(
        {
          onClick: input.onSort(input.column),
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.AriaLabel(`Sort by ${input.label}, currently ${state}`),
                h.Class(
                  classNames(
                    'inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline',
                    isActive && 'text-foreground',
                  ),
                ),
              ],
              [input.label, isActive ? sortGlyph(input.order, h) : h.empty],
            ),
        },
        h,
      ),
    ],
  )
}

const sortGlyph = <Message>(order: 'asc' | 'desc', h: HtmlBuilder<Message>): Html =>
  h.span([h.Class('text-[0.55rem] leading-none')], [order === 'asc' ? '▲' : '▼'])

// CELL

export const td = <Message>(
  h: HtmlBuilder<Message>,
  content: Html | string,
  options?: Readonly<{ isNumeric?: boolean | undefined, isMuted?: boolean | undefined }>,
): Html =>
  h.td(
    [
      h.Class(
        classNames(
          bodyCellClass,
          options?.isNumeric === true && numericClass,
          options?.isMuted === true && 'text-muted-foreground',
        ),
      ),
    ],
    [content],
  )

/**
 * A cell that spans the table, for a listing with no rows.
 */
export const emptyRow = <Message>(h: HtmlBuilder<Message>, message: string): Html =>
  h.td(
    [h.Colspan(100), h.Class('px-3 py-10 text-center text-sm text-muted-foreground')],
    [message],
  )

// PLACEHOLDER

/**
 * The rows a table shows while it loads. The header stays put, so the columns
 * do not move when the data arrives. Each placeholder keeps a text cue, so the
 * state reads as loading with motion off or animation disabled.
 */
export const loadingRows = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Array.makeBy(placeholderRows, () =>
    h.tr(
      [h.Class('border-b border-border last:border-0')],
      [
        h.td(
          [h.Colspan(100), h.Class('px-3 py-3'), h.Role('status'), h.AriaLabel('Loading rows')],
          [
            h.div([h.Class('flex items-center gap-2')], [
              h.div([h.Class('h-4 w-full animate-pulse rounded bg-muted')]),
              h.span([h.Class('sr-only')], ['Loading…']),
            ]),
          ],
        ),
      ],
    ))
