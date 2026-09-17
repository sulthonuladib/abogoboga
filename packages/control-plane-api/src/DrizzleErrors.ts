import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Option } from "effect"
import { SqlError, UniqueViolation } from "effect/unstable/sql/SqlError"

/**
 * Extract the violated unique constraint from a Drizzle query error.
 *
 * Adapters translate a returned constraint name into their precise duplicate
 * error; `none` means the failure is not a unique violation and stays a defect.
 *
 * @param error - Query error raised by a Drizzle statement.
 * @returns The violated constraint name when the cause is a Postgres unique violation.
 */
export const uniqueViolationConstraint = (error: EffectDrizzleQueryError): Option.Option<string> => {
  if (!Cause.isCause(error.cause)) return Option.none()

  const sqlError = Cause.findErrorOption(error.cause)

  if (Option.isNone(sqlError) || !(sqlError.value instanceof SqlError)) return Option.none()

  if (!(sqlError.value.reason instanceof UniqueViolation)) return Option.none()

  return Option.some(sqlError.value.reason.constraint)
}
