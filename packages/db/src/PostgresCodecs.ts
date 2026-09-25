import { effectPgCodecs } from "drizzle-orm/effect-postgres"
import { arrayCompatNormalize, type PgCodecs } from "drizzle-orm/pg-core/codecs"

const pgTextDecoder = new TextDecoder()

/**
 * Normalize one PostgreSQL enum value coming off the wire.
 *
 * `@effect/sql-pg` has no built-in binary codec for enum OIDs, so it hands the
 * raw bytes through, while Drizzle's `enum` codec declares no `normalize`.
 * Without this, enum columns reach the domain layer as `Uint8Array` and fail
 * schema decoding. The embedded PGlite driver already returns strings, so
 * string values pass through unchanged.
 *
 * @param value - Raw driver value for an enum column.
 * @returns The UTF-8 text of byte values, or the string value unchanged.
 */
export const normalizePgEnum = (value: Uint8Array | string): string =>
  value instanceof Uint8Array ? pgTextDecoder.decode(value) : value

/**
 * Drizzle binary codecs for the Effect Postgres driver.
 *
 * Extends the stock `effect-postgres` codecs with enum normalization so enum
 * columns decode to text (see {@link normalizePgEnum}) in every read path,
 * including `returning()`.
 */
export const postgresCodecs: PgCodecs = {
  ...effectPgCodecs,
  enum: {
    ...effectPgCodecs.enum,
    normalize: normalizePgEnum,
    normalizeArray: arrayCompatNormalize(normalizePgEnum),
    normalizeInJson: normalizePgEnum,
    normalizeArrayInJson: arrayCompatNormalize(normalizePgEnum)
  }
}
