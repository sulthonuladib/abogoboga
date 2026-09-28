/**
 * Search-text helpers shared by the list stores.
 *
 * @module
 */

/**
 * Escape a user's search text for a literal `ILIKE` match and wrap it in
 * wildcards.
 *
 * Postgres `LIKE`/`ILIKE` treats `%` and `_` as wildcards and `\` as the
 * escape character, so the input is escaped before interpolation: searching
 * for `100%` matches rows containing the literal text, not every row. The
 * search is lower-cased to pair with `ILIKE`.
 *
 * @param search - Raw user search text.
 * @returns An escaped `%…%` pattern for `ILIKE`.
 */
export const literalLikePattern = (search: string): string =>
  `%${search.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
