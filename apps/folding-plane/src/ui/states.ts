import { Button } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// SECTION

/**
 * A heading with the sentence that explains what the section below it is for.
 */
export const sectionHeading = <Message>(
  input: Readonly<{ title: string, note: string, h: HtmlBuilder<Message> }>,
): Html => {
  const { h } = input

  return h.div([h.Class('flex flex-wrap items-baseline justify-between gap-2')], [
    h.h2([h.Class('text-sm font-semibold tracking-tight')], [input.title]),
    h.p([h.Class('text-xs text-muted-foreground')], [input.note]),
  ])
}

// EMPTY

/**
 * The block a listing shows when it has no rows. The action is the way out of
 * the state that produced it, such as clearing a filter or adding the first
 * record.
 */
export const emptyState = <Message>(
  input: Readonly<{
    title: string
    description: string
    action?: Html | undefined
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const { h } = input

  return h.div(
    [h.Class('rounded-2xl border border-dashed px-4 py-10 text-center')],
    [
      h.p([h.Class('text-sm font-medium')], [input.title]),
      h.p([h.Class('mt-1 text-sm text-muted-foreground')], [input.description]),
      input.action === undefined ? h.empty : h.div([h.Class('mt-4')], [input.action]),
    ],
  )
}

// ERROR

/**
 * A failed request, with the reason the API gave and a way to try again.
 */
export const errorPanel = <Message>(
  input: Readonly<{
    title: string
    detail: string
    onRetry: Message
    retryLabel?: string | undefined
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const { h } = input

  return h.div(
    [
      h.Class(
        'flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3',
      ),
      h.Role('alert'),
    ],
    [
      h.div([h.Class('flex flex-col gap-0.5')], [
        h.p([h.Class('text-sm font-medium text-destructive')], [input.title]),
        h.p([h.Class('text-sm text-muted-foreground')], [input.detail]),
      ]),
      Button.view(
        {
          onClick: input.onRetry,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.Class(
                  'rounded-lg bg-card px-2.5 py-1 text-xs shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]',
                ),
              ],
              [input.retryLabel ?? 'Retry'],
            ),
        },
        h,
      ),
    ],
  )
}

/**
 * The notice a failed refresh leaves above data that is still on screen.
 */
export const staleNotice = <Message>(
  input: Readonly<{ detail: string, onRetry: Message, h: HtmlBuilder<Message> }>,
): Html => {
  const { h } = input

  return h.div(
    [
      h.Class(
        'flex flex-wrap items-center justify-between gap-2 rounded-xl bg-popover px-3 py-2 text-xs shadow-[var(--shadow-border)]',
      ),
    ],
    [
      h.span([h.Class('text-foreground')], [
        `Showing the last loaded rows. ${input.detail}`,
      ]),
      h.button(
        [
          h.Type('button'),
          h.OnClick(input.onRetry),
          h.Class('underline underline-offset-4'),
        ],
        ['Retry'],
      ),
    ],
  )
}

// LOADING

export const loadingPanel = <Message>(
  message: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class(
        'flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm text-muted-foreground shadow-[var(--shadow-border)]',
      ),
      h.Role('status'),
    ],
    [h.div([h.Class('size-2 animate-pulse rounded-full bg-muted-foreground')]), message],
  )
