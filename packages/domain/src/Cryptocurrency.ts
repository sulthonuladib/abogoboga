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
 * A cryptocurrency field that can be edited after creation.
 *
 * Required on select/insert/JSON variants, optional on the update variants, so
 * `Cryptocurrency.jsonUpdate` describes a real patch payload.
 */
const Editable = <S extends Schema.Top>(schema: S) =>
  Model.Field({
    select: schema,
    insert: schema,
    update: Schema.optional(schema),
    json: schema,
    jsonCreate: schema,
    jsonUpdate: Schema.optional(schema)
  })

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
  name: Editable(Schema.NonEmptyString),
  symbol: Editable(Schema.NonEmptyString),
  slug: Editable(Schema.NonEmptyString),
  logo: Schema.NonEmptyString,
  cmcId: Editable(Schema.Int),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
