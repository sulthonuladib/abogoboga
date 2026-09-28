import { and, eq, gt, lt, or, type SQL, type SQLWrapper } from "drizzle-orm"

/**
 * One sort key of a keyset comparison: the SQL expression to compare, the
 * direction to compare it in, and the cursor value to compare against.
 */
export type KeysetKey = {
  readonly expression: SQLWrapper
  readonly direction: "asc" | "desc"
  readonly value: string | number
}

/**
 * Pair sort specifications with the values of a decoded cursor.
 *
 * Pairs are matched by position and the shorter list wins, so a cursor with
 * fewer values than the sort keys pages over the prefix it describes. Stores
 * always build their sort specifications with the primary key last, giving the
 * comparison a total order.
 *
 * @param expressions - Sort keys in comparison order.
 * @param values - Cursor values in comparison order.
 * @returns The comparable keys.
 */
export const keysetKeys = (
  expressions: ReadonlyArray<{ readonly expression: SQLWrapper; readonly direction: "asc" | "desc" }>,
  values: ReadonlyArray<string | number>
): ReadonlyArray<KeysetKey> =>
  expressions.flatMap((spec, index) => {
    const value = values[index]

    return value === undefined ? [] : [{ expression: spec.expression, direction: spec.direction, value }]
  })

/**
 * Build the lexicographic "strictly after the cursor" predicate for a keyset
 * window.
 *
 * A row is after the cursor when it is greater than the cursor on the first
 * sort key, or equal on every preceding key and greater on the next. Columns
 * ordered `asc` compare with `>`, columns ordered `desc` compare with `<`.
 *
 * @param keys - Sort keys with their cursor values, in comparison order.
 * @returns The predicate, or `undefined` when there is nothing to compare.
 */
export const keysetPredicate = (keys: ReadonlyArray<KeysetKey>): SQL | undefined => {
  const clauses: Array<SQL> = []

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]

    if (key === undefined) continue

    const comparisons: Array<SQL> = []

    for (let prior = 0; prior < index; prior++) {
      const preceding = keys[prior]

      if (preceding !== undefined) {
        comparisons.push(eq(preceding.expression, preceding.value))
      }
    }

    comparisons.push(key.direction === "asc" ? gt(key.expression, key.value) : lt(key.expression, key.value))

    const clause = and(...comparisons)

    if (clause !== undefined) clauses.push(clause)
  }

  return clauses.length === 0 ? undefined : or(...clauses)
}
