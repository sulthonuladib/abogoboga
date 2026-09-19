import { Option, Schema } from "effect"

/**
 * One price level: `[price, quantity]`.
 */
export const PriceLevel = Schema.Tuple([Schema.Number, Schema.Number])

/**
 * One price level: `[price, quantity]`.
 */
export type PriceLevel = typeof PriceLevel.Type

/**
 * A canonical order-book tick emitted by a worker on stdout.
 *
 * Prices and quantities are numbers; `cmcId` and `timestamp` are strict
 * integers.
 */
export const CanonicalTick = Schema.Struct({
  exchangeSlug: Schema.NonEmptyString,
  symbol: Schema.NonEmptyString,
  cmcId: Schema.Int,
  bids: Schema.Array(PriceLevel),
  asks: Schema.Array(PriceLevel),
  timestamp: Schema.Int
})

/**
 * A canonical order-book tick emitted by a worker on stdout.
 */
export type CanonicalTick = typeof CanonicalTick.Type

/**
 * Decode one stdout line into a tick.
 *
 * Blank lines, invalid JSON, and well-formed JSON with the wrong shape all
 * decode to `null`; callers skip nulls (stderr is the log channel).
 *
 * @param line - The raw stdout line.
 * @returns The parsed tick, or `null` when the line must be skipped.
 */
export const decodeTickLine = (line: string): CanonicalTick | null => {
  const trimmed = line.trim()

  if (trimmed === "") {
    return null
  }

  let raw: unknown

  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }

  return Option.getOrNull(Schema.decodeUnknownOption(CanonicalTick)(raw))
}

/**
 * Encode a tick as one stdout line.
 *
 * @param tick - The tick to encode.
 * @returns The newline-delimited JSON representation (without the newline).
 */
export const encodeTickLine = (tick: CanonicalTick): string =>
  JSON.stringify(Schema.encodeSync(CanonicalTick)(tick))
