import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"

/**
 * Local-dev Postgres URL used when `DATABASE_URL` is unset outside production.
 */
export const localDatabaseUrl = "postgres://orchestra:change-me-local@localhost:5432/orchestra" as const

/**
 * Default HTTP port, matching the existing `app.listen(3001)` behavior.
 */
export const defaultPort = 3001 as const

/**
 * Default service identity for the control-plane entrypoint.
 */
export const defaultServiceName = "control-plane" as const

/**
 * Failure when `DATABASE_URL` is missing while running in production.
 */
export class MissingDatabaseUrlError extends Schema.TaggedError<MissingDatabaseUrlError>()(
  "MissingDatabaseUrlError",
  {
    environment: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64)))
  }
) {}

/**
 * Failure when `DATABASE_URL` is not a valid Postgres connection URL.
 */
export class InvalidDatabaseUrlError extends Schema.TaggedError<InvalidDatabaseUrlError>()(
  "InvalidDatabaseUrlError",
  {
    reason: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(1024)))
  }
) {}

/**
 * Validated application environment name.
 */
export type AppEnvironment = "development" | "production" | "test"

/**
 * Runtime application configuration, parsed once at the composition root.
 */
export type AppConfigService = {
  /** Postgres connection string, kept redacted in logs and traces. */
  readonly databaseUrl: Redacted.Redacted<string>
  /** HTTP port the server listens on. */
  readonly port: number
  /** Service identity used in logs and traces. */
  readonly serviceName: string
  /** Validated `NODE_ENV` value. */
  readonly environment: AppEnvironment
}

/**
 * Application configuration service.
 *
 * Reads `DATABASE_URL`, `PORT`, `SERVICE_NAME`, and `NODE_ENV` from the
 * default config provider, preserving the legacy behavior: a local-dev
 * default URL outside production, and a hard failure when `DATABASE_URL`
 * is missing in production.
 */
export class AppConfig extends Context.Service<AppConfig, AppConfigService>()("lister/config/AppConfig") {
  /**
   * Live layer building `AppConfig` from environment config.
   *
   * Fails with `MissingDatabaseUrlError` when `DATABASE_URL` is absent in
   * production, or `InvalidDatabaseUrlError` when the URL is not a valid
   * `postgres://` URL, alongside standard `ConfigError` for malformed values.
   */
  static readonly layer: Layer.Layer<AppConfig, Config.ConfigError | MissingDatabaseUrlError | InvalidDatabaseUrlError> =
    Layer.effect(
      AppConfig,
      Effect.gen(function*() {
        const environment = yield* Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
          Config.withDefault("development" satisfies AppEnvironment)
        )

        const maybeUrl = yield* Config.option(Config.Redacted("DATABASE_URL"))

        const databaseUrl = Option.isSome(maybeUrl)
          ? maybeUrl.value
          : environment === "production"
            ? yield* new MissingDatabaseUrlError({ environment })
            : Redacted.make(localDatabaseUrl)

        yield* validateDatabaseUrl(databaseUrl)

        const port = yield* Config.Port("PORT").pipe(Config.withDefault(defaultPort))

        const serviceName = yield* Config.String("SERVICE_NAME").pipe(Config.withDefault(defaultServiceName))

        return AppConfig.of({
          databaseUrl,
          port,
          serviceName,
          environment
        })
      })
    )
}

/**
 * Validate that a database URL uses the `postgres://` scheme.
 *
 * @param databaseUrl - The redacted URL to validate.
 * @returns Void on success, `InvalidDatabaseUrlError` when the scheme is wrong.
 */
export const validateDatabaseUrl = Effect.fn("validateDatabaseUrl")(function*(
  databaseUrl: Redacted.Redacted<string>
): Effect.fn.Return<void, InvalidDatabaseUrlError> {
  const raw = Redacted.value(databaseUrl)

  let parsed: URL

  try {
    parsed = new URL(raw)
  } catch {
    return yield* new InvalidDatabaseUrlError({ reason: "DATABASE_URL must be a valid URL" })
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return yield* new InvalidDatabaseUrlError({
      reason: "DATABASE_URL must use the postgres:// or postgresql:// scheme"
    })
  }
})
