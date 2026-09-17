import { Schema } from "effect"
import { Model } from "effect/unstable/schema"

/**
 * Branded chain primary key.
 */
export const ChainId = Schema.Int.pipe(Schema.brand("ChainId"))

/**
 * Branded chain primary key.
 */
export type ChainId = typeof ChainId.Type

/**
 * Chain domain model.
 *
 * A single field declaration derives the database variants (`Chain` for
 * selects, `Chain.insert`, `Chain.update`) and the JSON variants
 * (`Chain.json`, `Chain.jsonCreate`, `Chain.jsonUpdate`).
 */
export class Chain extends Model.Class<Chain>("Chain")({
  id: Model.GeneratedByDb(ChainId),
  name: Schema.NonEmptyString,
  code: Schema.NonEmptyString,
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate
}) {}
