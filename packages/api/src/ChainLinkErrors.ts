import { ChainId, ChainLinkId, MarketId } from "@lister/domain"
import { Schema } from "effect"
import { ChainNotFound } from "./ChainErrors.ts"
import { MarketNotFound } from "./MarketErrors.ts"

/**
 * Expected failure: no chain link matches the requested id.
 */
export class ChainLinkNotFound extends Schema.TaggedError<ChainLinkNotFound>()(
  "ChainLinkNotFound",
  { id: ChainLinkId },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: the market/chain pair already has a link.
 */
export class ChainLinkExists extends Schema.TaggedError<ChainLinkExists>()(
  "ChainLinkExists",
  { exchangeCryptocurrencyId: MarketId, chainId: ChainId },
  { httpApiStatus: 409 }
) {}

/**
 * Failure reasons of the {@link ChainLink} application service.
 *
 * Reference failures reuse the market and chain errors so a missing foreign
 * key is reported with the same tag and status as the owning group.
 */
export const ChainLinkReason = Schema.Union([
  ChainLinkNotFound,
  ChainLinkExists,
  MarketNotFound,
  ChainNotFound
])

/**
 * Decoded failure reason of the chain-link application service.
 */
export type ChainLinkReason = typeof ChainLinkReason.Type

/**
 * Expected failure wrapper for every `ChainLink` application-service operation.
 *
 * The service exposes one error type; handlers unwrap `reason` with
 * `Effect.catchReasons` and re-fail only the reasons their endpoint declares.
 */
export class ChainLinkError extends Schema.TaggedError<ChainLinkError>()("ChainLinkError", {
  reason: ChainLinkReason
}) {}
