import { Button } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// HEADER

/**
 * The heading every page opens with: a way back, the page's name, one sentence
 * about what it is for, and the actions that page offers.
 */
export const pageHeader = <Message>(
  input: Readonly<{
    title: string
    description: string
    back?: Readonly<{ href: string, label: string }> | undefined
    actions?: ReadonlyArray<Html> | undefined
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const { h } = input

  return h.div([h.Class('flex flex-wrap items-start justify-between gap-4')], [
    h.div([h.Class('flex min-w-0 flex-col gap-1')], [
      input.back === undefined
        ? h.empty
        : h.a(
          [
            h.Href(input.back.href),
            h.Class('text-xs text-muted-foreground hover:text-foreground'),
          ],
          [`← ${input.back.label}`],
        ),
      h.h1([h.Class('text-xl font-semibold tracking-tight')], [input.title]),
      h.p([h.Class('text-sm text-muted-foreground')], [input.description]),
    ]),
    input.actions === undefined || input.actions.length === 0
      ? h.empty
      : h.div([h.Class('flex flex-wrap items-center gap-2')], input.actions),
  ])
}

// ACTION

export const action = <Message>(
  input: Readonly<{
    label: string
    onClick: Message
    isPrimary?: boolean | undefined
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Button.view(
    {
      onClick: input.onClick,
      toView: (attributes) =>
        input.h.button(
          [
            ...attributes.button,
            input.h.Class(
              input.isPrimary === true
                ? 'rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[scale,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-primary/90'
                : 'rounded-lg bg-card px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]',
            ),
          ],
          [input.label],
        ),
    },
    input.h,
  )

/**
 * An icon-only control. The label is the accessible name, so the control works
 * with a screen reader and a pointer alike.
 */
export const iconAction = <Message>(
  input: Readonly<{
    label: string
    icon: Html
    onClick: Message
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Button.view(
    {
      onClick: input.onClick,
      toView: (attributes) =>
        input.h.button(
          [
            ...attributes.button,
            input.h.AriaLabel(input.label),
            input.h.Title(input.label),
            input.h.Class(
              'inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:text-foreground',
            ),
          ],
          [input.icon],
        ),
    },
    input.h,
  )

// STATS

export type Stat = Readonly<{
  label: string
  value: string
  hint?: string | undefined
  href?: string | undefined
  isCritical?: boolean | undefined
}>

/**
 * A row of figures, each one a link where the figure leads somewhere.
 */
export const statStrip = <Message>(
  stats: ReadonlyArray<Stat>,
  h: HtmlBuilder<Message>,
): Html =>
  h.dl(
    [h.Class('grid grid-cols-2 gap-3 lg:grid-cols-4')],
    stats.map((stat) =>
      h.keyed('div')(stat.label, [h.Class('rounded-2xl bg-card px-3 py-2.5 shadow-[var(--shadow-border)]')], [
        h.dt([h.Class('text-xs text-muted-foreground')], [stat.label]),
        h.dd([h.Class('mt-0.5 flex flex-col gap-0.5')], [
          h.span(
            [
              h.Class(
                stat.isCritical === true
                  ? 'text-2xl font-semibold tabular-nums text-destructive'
                  : 'text-2xl font-semibold tabular-nums',
              ),
            ],
            [stat.value],
          ),
          stat.hint === undefined
            ? h.empty
            : h.span([h.Class('text-xs text-muted-foreground')], [stat.hint]),
          stat.href === undefined
            ? h.empty
            : h.a(
              [
                h.Href(stat.href),
                h.Class('text-xs text-muted-foreground hover:text-foreground'),
              ],
              ['View'],
            ),
        ]),
      ])),
  )
