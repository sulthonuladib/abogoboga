import { Schema } from "effect"
import { Model } from "effect/schema"

/**
 * Branded cryptocurrency primary key.
 */
export const CryptocurrencyId = Schema.Int.pipe(Schema.brand("CryptocurrencyId"))

/**
 * Branded cryptocurrency primary key.
 */
export type CryptocurrencyId = typeof CryptocurrencyId.Type

/**
 * Cryptocurrency domain model.
 *
 * A single field declaration derives the database variants (`Cryptocurrency`
 * for selects, `Cryptocurrency.insert`, `Cryptocurrency.update`) and the JSON
 * variants (`Cryptocurrency.json`, `Cryptocurrency.jsonCreate`,
 * `Cryptocurrency.jsonUpdate`).
 */
export class Cryptocurrency extends Model.Class<Cryptocurrency>("Cryptocurrency")({
  id: Model.GeneratedByDb(CryptocurrencyId),
  name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  symbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  // Empty is a valid "no logo" state: the CoinGecko scanner drops oversized
  // URLs and leaves misses blank, and the UI renders a symbol fallback.
  logo: Schema.String.pipe(Schema.check(Schema.isMaxLength(255))),
  coingeckoId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
