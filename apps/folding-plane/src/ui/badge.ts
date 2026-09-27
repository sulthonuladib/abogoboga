import { Match } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// BADGE

/**
 * A short label carrying one fact about a row: a listing state, a coverage
 * count, a chain code. The variant is the meaning, so a screen reader gets the
 * same reading a colour gives.
 */
export type Variant = 'neutral' | 'positive' | 'critical' | 'warning'

const variantClass = Match.type<Variant>().pipe(
  Match.when('neutral', () => 'border-border bg-muted text-muted-foreground'),
  Match.when('positive', () => 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'),
  Match.when('warning', () => 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'),
  Match.when(
    'critical',
    () => 'border-transparent bg-destructive/15 text-destructive dark:text-red-400',
  ),
  Match.exhaustive,
)

const badgeClass = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium'

export const badge = <Message>(
  label: string,
  h: HtmlBuilder<Message>,
  variant: Variant = 'neutral',
  isUppercase: boolean = false,
): Html =>
  h.span(
    [h.Class(classNames(badgeClass, variantClass(variant), isUppercase && 'uppercase'))],
    [label],
  )
