import { describe, expect, test } from "bun:test"
import { ConfigProvider, Effect } from "effect"
import { LoggerLive, ObservabilityLive } from "./Observability.ts"

// See packages/config for why each case builds a fresh `fromEnv()` provider:
// the default ConfigProvider snapshots `process.env` once per process.
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

const otelKeys = [
  "OTEL_SDK_DISABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  "OTEL_TRACES_EXPORTER",
  "OTEL_METRICS_EXPORTER",
  "OTEL_LOGS_EXPORTER"
] as const

function clearOtel(): Record<string, undefined> {
  return Object.fromEntries(otelKeys.map((key) => [key, undefined]))
}

const loggedProgram = Effect.gen(function*() {
  yield* Effect.logInfo("observability smoke test")

  yield* Effect.sleep("1 millis").pipe(Effect.withSpan("observability.smoke"))
}).pipe(Effect.provide(ObservabilityLive))

const loggerProgram = Effect.logInfo("logger smoke test").pipe(Effect.provide(LoggerLive))

describe("Observability", () => {
  test("LoggerLive builds and logs outside production", async () => {
    await runWithEnv({ NODE_ENV: "development", LOG_LEVEL: undefined }, loggerProgram)

    expect(true).toBe(true)
  })

  test("LoggerLive builds and logs in production", async () => {
    await runWithEnv({ NODE_ENV: "production", LOG_LEVEL: "Warn" }, loggerProgram)

    expect(true).toBe(true)
  })

  test("ObservabilityLive builds with no collector configured", async () => {
    await runWithEnv({ NODE_ENV: "development", ...clearOtel() }, loggedProgram)

    expect(true).toBe(true)
  })

  test("ObservabilityLive builds with OTEL_SDK_DISABLED=1", async () => {
    await runWithEnv(
      {
        NODE_ENV: "production",
        OTEL_SDK_DISABLED: "1",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9"
      },
      loggedProgram
    )

    expect(true).toBe(true)
  })
})
