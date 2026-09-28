import { Predicate } from 'effect'

/**
 * The class names an element ends up with, in the order they were given.
 * Conditional names arrive as `false`, so a caller writes a condition inline
 * rather than building a string first.
 */
export const classNames = (...names: ReadonlyArray<string | false | undefined>): string =>
  names.filter(Predicate.isString).join(' ')
