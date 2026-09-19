import { Schema } from "effect"
import { Model } from "effect/unstable/schema"

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
  name: Schema.NonEmptyString,
  symbol: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
  logo: Schema.NonEmptyString,
  cmcId: Schema.Int,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
