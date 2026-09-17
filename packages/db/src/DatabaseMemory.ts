import { PgliteClient } from "@effect/sql-pglite"
import { makeWithDefaults } from "drizzle-orm/effect-pglite"
import { migrate } from "drizzle-orm/effect-pglite/migrator"
import { Effect, Layer } from "effect"
import { Database, defaultMigrationsFolder, type DatabaseError, type DatabaseLayerOptions } from "./Database.ts"
import { dbRelations } from "./relations.ts"

const databaseHandle = makeWithDefaults({ relations: dbRelations })

/**
 * In-memory PGlite layer for repository and application-service tests.
 *
 * Applies the same Drizzle migrations as {@link Database.layer}, so tests
 * exercise the real schema without a Postgres server.
 */
export const layerMemory = (options?: DatabaseLayerOptions): Layer.Layer<Database, DatabaseError> =>
  Layer.effect(
    Database,
    Effect.gen(function*() {
      const db = yield* databaseHandle

      yield* migrate(db, {
        migrationsFolder: options?.migrationsFolder ?? defaultMigrationsFolder
      })

      return Database.of({ db })
    })
  ).pipe(Layer.provide(PgliteClient.layer()))
