import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import { CryptocurrencyId } from "./Cryptocurrency.ts"
import { ExchangeId } from "./Exchange.ts"

/**
 * Branded market-assignment primary key (`exchange_cryptocurrency` rows).
 */
export const MarketId = Schema.Int.pipe(Schema.brand("MarketId"))

/**
 * Branded market-assignment primary key.
 */
export type MarketId = typeof MarketId.Type

/**
 * Market-assignment domain model: a coin listed on an exchange.
 *
 * A single field declaration derives the database variants (`Market` for
 * selects, `Market.insert`, `Market.update`) and the JSON variants
 * (`Market.json`, `Market.jsonCreate`, `Market.jsonUpdate`).
 */
export class Market extends Model.Class<Market>("Market")({
  id: Model.GeneratedByDb(MarketId),
  exchangeId: ExchangeId,
  cryptocurrencyId: CryptocurrencyId,
  exchangeSymbol: Schema.NonEmptyString,
  listed: Schema.Boolean,
  tradeEnabled: Schema.Boolean,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
