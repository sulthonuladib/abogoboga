import { Schema } from "effect"
import { Model } from "effect/unstable/schema"
import { ChainId } from "./Chain.ts"
import { MarketId } from "./Market.ts"

/**
 * Branded chain-link primary key (`exchange_cryptocurrency_chain` rows).
 */
export const ChainLinkId = Schema.Int.pipe(Schema.brand("ChainLinkId"))

/**
 * Branded chain-link primary key.
 */
export type ChainLinkId = typeof ChainLinkId.Type

/**
 * Chain-link domain model: a market assignment depositable/withdrawable on a
 * chain under the exchange's own chain code.
 *
 * A single field declaration derives the database variants (`ChainLink` for
 * selects, `ChainLink.insert`, `ChainLink.update`) and the JSON variants
 * (`ChainLink.json`, `ChainLink.jsonCreate`, `ChainLink.jsonUpdate`).
 */
export class ChainLink extends Model.Class<ChainLink>("ChainLink")({
  id: Model.GeneratedByDb(ChainLinkId),
  exchangeChainCode: Schema.NonEmptyString,
  exchangeCryptocurrencyId: MarketId,
  chainId: ChainId,
  exchangeChainName: Schema.NullOr(Schema.String),
  withdrawEnabled: Schema.Boolean,
  depositEnabled: Schema.Boolean,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
