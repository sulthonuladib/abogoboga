import { PgClient } from "@effect/sql-pg"
import { AppConfig } from "@lister/config"
import { EffectDrizzleQueryError, MigratorInitError } from "drizzle-orm/effect-core/errors"
import { type EffectPgDatabase, makeWithDefaults } from "drizzle-orm/effect-postgres"
import { migrate } from "drizzle-orm/effect-postgres/migrator"
import { Config, Context, Effect, Layer } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { fileURLToPath } from "node:url"
import { postgresCodecs } from "./PostgresCodecs.ts"
import { dbRelations } from "./relations.ts"

/**
 * Drizzle migrations folder shipped with the repository.
 *
 * Resolved from this module so the default keeps working regardless of the
 * process working directory.
 */
export const defaultMigrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url))

const databaseHandle = makeWithDefaults({ relations: dbRelations, codecs: postgresCodecs })

/**
 * Drizzle database handle exposed by the `Database` service.
 */
export type DatabaseHandle = EffectPgDatabase<typeof dbRelations>

/**
 * Expected failures while building the database layer: connecting, initializing
 * the migrator, or applying migrations.
 */
export type DatabaseError = Config.ConfigError | SqlError | MigratorInitError | EffectDrizzleQueryError

/**
 * Options for {@link Database.layer}.
 */
export interface DatabaseLayerOptions {
  /** Drizzle migrations folder. Defaults to {@link defaultMigrationsFolder}. */
  readonly migrationsFolder?: string | undefined
}

/**
 * Postgres access over Drizzle and the Effect SQL client.
 *
 * The layer builds the connection pool from `AppConfig.databaseUrl` and applies
 * pending Drizzle migrations before exposing the handle, so any service that
 * depends on `Database` observes an up-to-date schema.
 */
export class Database extends Context.Service<Database, {
  /** Drizzle handle for queries and transactions. */
  readonly db: DatabaseHandle
}>()("lister/db/Database") {
  /**
   * Live layer backed by the configured Postgres instance.
   *
   * Requires `AppConfig` for the validated connection URL.
   */
  static readonly layer = (
    options?: DatabaseLayerOptions
  ): Layer.Layer<Database, DatabaseError, AppConfig> =>
    Layer.unwrap(
      Effect.gen(function*() {
        const config = yield* AppConfig
        const client = PgClient.layerConfig({ url: Config.succeed(config.databaseUrl) })

        return Layer.effect(
          Database,
          Effect.gen(function*() {
            const db = yield* databaseHandle

            yield* migrate(db, {
              migrationsFolder: options?.migrationsFolder ?? defaultMigrationsFolder
            })

            return Database.of({ db })
          })
        ).pipe(Layer.provide(client))
      })
    )

  /**
   * In-memory PGlite layer for repository and application-service tests.
   *
   * Loads the PGlite implementation lazily so production code never pulls the
   * embedded database into its module graph. Applies the same Drizzle
   * migrations as {@link Database.layer}.
   */
  static readonly layerMemory = (
    options?: DatabaseLayerOptions
  ): Layer.Layer<Database, DatabaseError> =>
    Layer.unwrap(
      Effect.promise(() => import("./DatabaseMemory.ts").then((module) => module.layerMemory(options)))
    )
}
