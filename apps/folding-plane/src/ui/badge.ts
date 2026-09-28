import { Match } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// BADGE

/**
 * A short label carrying one fact about a row: a listing state, a coverage
 * count, a chain code. The variant is the meaning, so a screen reader gets the
 * same reading a colour gives. Present states fill green, capable states fill
 * blue, partial states fill amber, blocked states fill red, and off states
 * and plain labels stay outlines.
 */
export type Variant = 'neutral' | 'positive' | 'info' | 'warning' | 'critical'

const variantClass = Match.type<Variant>().pipe(
  Match.when('neutral', () => 'badge-neutral'),
  Match.when('positive', () => 'badge-positive'),
  Match.when('info', () => 'badge-info'),
  Match.when('warning', () => 'badge-warning'),
  Match.when('critical', () => 'badge-critical'),
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
