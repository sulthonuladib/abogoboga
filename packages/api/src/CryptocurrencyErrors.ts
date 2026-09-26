import { CryptocurrencyId } from "@lister/domain"
import { Schema } from "effect"

/**
 * How a missing cryptocurrency was addressed.
 *
 * A tagged union instead of optional fields so an error always says exactly
 * which lookup failed.
 */
export const CryptocurrencyLookup = Schema.Union([
  Schema.Struct({ by: Schema.Literal("id"), id: CryptocurrencyId }),
  Schema.Struct({ by: Schema.Literal("slug"), slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) })
])

/**
 * Decoded cryptocurrency lookup.
 */
export type CryptocurrencyLookup = typeof CryptocurrencyLookup.Type

/**
 * Expected failure: no cryptocurrency matches the given lookup.
 */
export class CryptocurrencyNotFound extends Schema.TaggedError<CryptocurrencyNotFound>()(
  "CryptocurrencyNotFound",
  { lookup: CryptocurrencyLookup },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: another cryptocurrency already uses the given `coingeckoId`.
 */
export class CryptocurrencyCoingeckoIdExists extends Schema.TaggedError<CryptocurrencyCoingeckoIdExists>()(
  "CryptocurrencyCoingeckoIdExists",
  { coingeckoId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) },
  { httpApiStatus: 409 }
) {}

/**
 * Expected failure: another cryptocurrency already uses the given `slug`.
 */
export class CryptocurrencySlugExists extends Schema.TaggedError<CryptocurrencySlugExists>()(
  "CryptocurrencySlugExists",
  { slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) },
  { httpApiStatus: 409 }
) {}

/**
 * Failure reasons of the {@link Cryptocurrency} application service.
 */
export const CryptocurrencyReason = Schema.Union([
  CryptocurrencyNotFound,
  CryptocurrencyCoingeckoIdExists,
  CryptocurrencySlugExists
])

/**
 * Decoded failure reason of the cryptocurrency application service.
 */
export type CryptocurrencyReason = typeof CryptocurrencyReason.Type

/**
 * Expected failure wrapper for every `Cryptocurrency` application-service
 * operation.
 *
 * The service exposes one error type; handlers unwrap `reason` with
 * `Effect.catchReasons` and re-fail only the reasons their endpoint declares.
 */
export class CryptocurrencyError extends Schema.TaggedError<CryptocurrencyError>()("CryptocurrencyError", {
  reason: CryptocurrencyReason
}) {}
