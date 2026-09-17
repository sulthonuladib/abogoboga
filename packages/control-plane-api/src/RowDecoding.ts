import { Schema } from "effect"

/**
 * Decode raw database rows into their schema-backed domain values.
 *
 * Invalid rows are defects: the table shape and the model are defined
 * together, so a mismatch means the migration and code are out of sync.
 *
 * @param schema - Model schema to decode rows with.
 * @returns A mapping function from encoded rows to model instances.
 */
export const decodeRows =
  <S extends Schema.ConstraintDecoder<unknown>>(schema: S) =>
  (rows: ReadonlyArray<S["Encoded"]>): ReadonlyArray<S["Type"]> =>
    Schema.decodeUnknownSync(Schema.Array(schema))(rows)
