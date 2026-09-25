import { ExchangeId } from "@lister/domain"
import { Schema } from "effect"

/**
 * Expected failure: no exchange matches the requested id.
 */
export class ExchangeNotFound extends Schema.TaggedError<ExchangeNotFound>()(
  "ExchangeNotFound",
  { id: ExchangeId },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: another exchange already uses the given `cmcId`.
 */
export class ExchangeCmcIdExists extends Schema.TaggedError<ExchangeCmcIdExists>()(
  "ExchangeCmcIdExists",
  { cmcId: Schema.Int },
  { httpApiStatus: 409 }
) {}

/**
 * Expected failure: another exchange already uses the given `slug`.
 */
export class ExchangeSlugExists extends Schema.TaggedError<ExchangeSlugExists>()(
  "ExchangeSlugExists",
  { slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) },
  { httpApiStatus: 409 }
) {}

/**
 * Failure reasons of the {@link Exchange} application service.
 */
export const ExchangeReason = Schema.Union([ExchangeNotFound, ExchangeCmcIdExists, ExchangeSlugExists])

/**
 * Decoded failure reason of the exchange application service.
 */
export type ExchangeReason = typeof ExchangeReason.Type

/**
 * Expected failure wrapper for every `Exchange` application-service operation.
 *
 * The service exposes one error type; handlers unwrap `reason` with
 * `Effect.catchReasons` and re-fail only the reasons their endpoint declares.
 */
export class ExchangeError extends Schema.TaggedError<ExchangeError>()("ExchangeError", {
  reason: ExchangeReason
}) {}
