/**
 * Route parameter parsing.
 *
 * Client routes carry entity ids and page numbers as URL segments; parsing
 * them here keeps pages from passing raw strings into typed API calls.
 *
 * @module
 */

/**
 * Parse a positive integer route segment.
 *
 * @param raw - Raw segment, possibly `undefined` outside a matching route.
 * @returns The id, or `undefined` when the segment is not a positive integer.
 */
export const parseRouteId = (raw: string | undefined): number | undefined => {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return undefined

  return Number(raw)
}

/**
 * Parse a one-based page query parameter.
 *
 * @param raw - Raw query value.
 * @returns The page number, defaulting to the first page.
 */
export const parsePageParam = (raw: string | null): number => {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return 1

  return Number(raw)
}
