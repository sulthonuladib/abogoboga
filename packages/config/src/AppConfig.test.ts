import { describe, expect, test } from "bun:test"
import { ConfigProvider, Effect, Layer, Redacted } from "effect"
import { AppConfig, InvalidDatabaseUrlError, MissingDatabaseUrlError, localDatabaseUrl } from "./AppConfig.ts"

// The default ConfigProvider snapshots `process.env` once per process
// (Context.Reference memoizes its default), so each case builds a fresh
// `fromEnv()` provider *after* mutating `process.env`. This keeps the
// env-var semantics (names, nesting, missing-value behavior) while giving
// each case isolated input.
function runWithEnv<A, E>(env: Record<string, string | undefined>, effect: Effect.Effect<A, E>): Promise<A> {
  const saved: Record<string, string | undefined> = {}

  for (const key of Object.keys(env)) {
    saved[key] = process.env[key]

    if (env[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = env[key]
    }
  }

  const provider = ConfigProvider.fromEnv()

  return Effect.runPromise(
    effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))
  ).finally(() => {
    for (const key of Object.keys(env)) {
      if (saved[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = saved[key]
      }
    }
  })
}

const readConfig = Effect.provide(
  Effect.map(AppConfig, (c) => ({
      databaseUrl: Redacted.value(c.databaseUrl),
      port: c.port,
      serviceName: c.serviceName,
      environment: c.environment
    })),
  AppConfig.layer
)

describe("AppConfig", () => {
  test("uses local defaults outside production", async () => {
    const config = await runWithEnv(
      { DATABASE_URL: undefined, NODE_ENV: undefined, PORT: undefined, SERVICE_NAME: undefined },
      readConfig
    )

    expect(config.databaseUrl).toBe(localDatabaseUrl)
    expect(config.port).toBe(3001)
    expect(config.environment).toBe("development")
    expect(config.serviceName).toBe("control-plane")
  })

  test("uses explicit values when set", async () => {
    const config = await runWithEnv(
      {
        DATABASE_URL: "postgres://user:pass@localhost:5432/custom",
        NODE_ENV: "test",
        PORT: "4000",
        SERVICE_NAME: "worker"
      },
      readConfig
    )

    expect(config.databaseUrl).toBe("postgres://user:pass@localhost:5432/custom")
    expect(config.port).toBe(4000)
    expect(config.environment).toBe("test")
    expect(config.serviceName).toBe("worker")
  })

  test("fails when DATABASE_URL is missing in production", async () => {
    const result = await runWithEnv(
      { DATABASE_URL: undefined, NODE_ENV: "production" },
      Effect.flip(Effect.provide(Effect.asVoid(AppConfig), AppConfig.layer))
    )

    expect(result).toBeInstanceOf(MissingDatabaseUrlError)
  })

  test("fails when DATABASE_URL has the wrong scheme", async () => {
    const result = await runWithEnv(
      { DATABASE_URL: "mysql://localhost/db", NODE_ENV: "development" },
      Effect.flip(Effect.provide(Effect.asVoid(AppConfig), AppConfig.layer))
    )

    expect(result).toBeInstanceOf(InvalidDatabaseUrlError)
  })

  test("never renders the secret", async () => {
    const redacted = await runWithEnv(
      { DATABASE_URL: "postgres://user:s3cret@localhost/db", NODE_ENV: "development" },
      // oxlint-disable-next-line no-base-to-string -- SAFETY: Redacted implements a custom toString that renders "<redacted>"; asserting that rendering is the point of this test.
      Effect.provide(Effect.map(AppConfig, (c) => String(c.databaseUrl)), AppConfig.layer)
    )

    expect(redacted).toBe("<redacted>")
    expect(redacted).not.toContain("s3cret")
  })
})

export const configTestLayer = Layer.succeed(
  AppConfig,
  AppConfig.of({
    databaseUrl: Redacted.make(localDatabaseUrl),
    port: 3001,
    serviceName: "test",
    environment: "test"
  })
)
