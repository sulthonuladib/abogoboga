import { ChainId } from "@lister/domain"
import { Schema } from "effect"

/**
 * Expected failure: no chain matches the requested id.
 */
export class ChainNotFound extends Schema.TaggedError<ChainNotFound>()(
  "ChainNotFound",
  { id: ChainId },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: another chain already uses the given `code`.
 */
export class ChainCodeExists extends Schema.TaggedError<ChainCodeExists>()(
  "ChainCodeExists",
  { code: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) },
  { httpApiStatus: 409 }
) {}

/**
 * Failure reasons of the {@link Chain} application service.
 */
export const ChainReason = Schema.Union([ChainNotFound, ChainCodeExists])

/**
 * Decoded failure reason of the chain application service.
 */
export type ChainReason = typeof ChainReason.Type

/**
 * Expected failure wrapper for every `Chain` application-service operation.
 *
 * The service exposes one error type; handlers unwrap `reason` with
 * `Effect.catchReasons` and re-fail only the reasons their endpoint declares.
 */
export class ChainError extends Schema.TaggedError<ChainError>()("ChainError", {
  reason: ChainReason
}) {}
