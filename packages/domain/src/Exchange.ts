import { Schema } from "effect"
import { Model } from "effect/unstable/schema"

/**
 * Branded exchange primary key.
 *
 * Brands the raw integer so exchange ids cannot be mixed up with other
 * aggregate ids at call sites.
 */
export const ExchangeId = Schema.Int.pipe(Schema.brand("ExchangeId"))

/**
 * Branded exchange primary key.
 */
export type ExchangeId = typeof ExchangeId.Type

/**
 * Exchange domain model.
 *
 * A single field declaration derives the database variants (`Exchange` for
 * selects, `Exchange.insert`, `Exchange.update`) and the JSON variants
 * (`Exchange.json`, `Exchange.jsonCreate`, `Exchange.jsonUpdate`).
 */
export class Exchange extends Model.Class<Exchange>("Exchange")({
  id: Model.GeneratedByDb(ExchangeId),
  coingeckoId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  logo: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  registeredOnCmc: Schema.Boolean,
  baseCurrency: Schema.Literals(["usdt", "idr"]),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
