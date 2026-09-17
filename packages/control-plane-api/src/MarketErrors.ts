import { CryptocurrencyId, ExchangeId, MarketId } from "@lister/domain"
import { Schema } from "effect"
import { CryptocurrencyNotFound } from "./CryptocurrencyErrors.ts"
import { ExchangeNotFound } from "./ExchangeErrors.ts"

/**
 * Expected failure: no market assignment matches the requested id.
 */
export class MarketNotFound extends Schema.TaggedError<MarketNotFound>()(
  "MarketNotFound",
  { id: MarketId },
  { httpApiStatus: 404 }
) {}

/**
 * Expected failure: the exchange/coin pair is already assigned.
 */
export class MarketExists extends Schema.TaggedError<MarketExists>()(
  "MarketExists",
  { exchangeId: ExchangeId, cryptocurrencyId: CryptocurrencyId },
  { httpApiStatus: 409 }
) {}

/**
 * Failure reasons of the {@link Market} application service.
 *
 * Reference failures reuse the exchange and cryptocurrency errors so a missing
 * foreign key is reported with the same tag and status as the owning group.
 */
export const MarketReason = Schema.Union([
  MarketNotFound,
  MarketExists,
  ExchangeNotFound,
  CryptocurrencyNotFound
])

/**
 * Decoded failure reason of the market-assignment application service.
 */
export type MarketReason = typeof MarketReason.Type

/**
 * Expected failure wrapper for every `Market` application-service operation.
 *
 * The service exposes one error type; handlers unwrap `reason` with
 * `Effect.catchReasons` and re-fail only the reasons their endpoint declares.
 */
export class MarketError extends Schema.TaggedError<MarketError>()("MarketError", {
  reason: MarketReason
}) {}
