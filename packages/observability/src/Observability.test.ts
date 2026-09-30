import { describe, expect, test } from "bun:test"
import { ConfigProvider, Effect, Schema } from "effect"
import { LoggerLive, ObservabilityBrowserLive, ObservabilityLive } from "./Observability.ts"

/**
 * Minimal OTLP/HTTP trace payload: just enough to read the exported service
 * name and the span names that were sent.
 */
const TracePayload = Schema.Struct({
  resourceSpans: Schema.Array(
    Schema.Struct({
      resource: Schema.Struct({
        attributes: Schema.Array(
          Schema.Struct({
            key: Schema.String,
            value: Schema.Struct({ stringValue: Schema.optional(Schema.String) })
          })
        )
      }),
      scopeSpans: Schema.Array(
        Schema.Struct({ spans: Schema.Array(Schema.Struct({ name: Schema.String })) })
      )
    })
  )
})

type TracePayload = typeof TracePayload.Type

type CollectorRequest = {
  readonly path: string
  readonly body: string
}

type Collector = {
  readonly endpoint: string
  readonly requests: Array<CollectorRequest>
  readonly stop: () => void
}

/**
 * An in-process OTLP collector that records every request it receives. It
 * answers 200 to any path so an export attempt always looks successful.
 */
const startCollector = (): Collector => {
  const requests: Array<CollectorRequest> = []

  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      requests.push({ path: new URL(request.url).pathname, body: await request.text() })

      return new Response(null, { status: 200 })
    }
  })

  return {
    endpoint: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => {
      void server.stop(true)
    }
  }
}

const decodeTrace = (request: CollectorRequest | undefined): TracePayload | undefined =>
  request === undefined ? undefined : Schema.decodeUnknownSync(TracePayload)(JSON.parse(request.body))

const exportedServiceName = (payload: TracePayload | undefined): string | undefined =>
  payload?.resourceSpans[0]?.resource.attributes.find((attribute) => attribute.key === "service.name")
    ?.value.stringValue

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
  "OTEL_SERVICE_NAME",
  "OTEL_TRACES_EXPORTER",
  "OTEL_METRICS_EXPORTER",
  "OTEL_LOGS_EXPORTER"
] as const

function clearOtel(): Record<string, undefined> {
  return Object.fromEntries(otelKeys.map((key) => [key, undefined]))
}

const processProgram = (serviceName: string) =>
  Effect.sleep("1 millis").pipe(
    Effect.withSpan("observability.smoke"),
    Effect.provide(ObservabilityLive({ serviceName }))
  )

const browserProgram = (baseUrl: string | undefined, serviceName: string) =>
  Effect.sleep("1 millis").pipe(
    Effect.withSpan("observability.browser"),
    Effect.provide(ObservabilityBrowserLive({ baseUrl, serviceName }))
  )

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

  test("ObservabilityLive builds with no collector configured and exports nothing", async () => {
    const collector = startCollector()

    try {
      await runWithEnv(
        { NODE_ENV: "development", ...clearOtel() },
        processProgram("observability-test")
      )

      expect(collector.requests).toHaveLength(0)
    } finally {
      collector.stop()
    }
  })

  test("ObservabilityLive builds with OTEL_SDK_DISABLED=1 and exports nothing", async () => {
    const collector = startCollector()

    try {
      await runWithEnv(
        {
          NODE_ENV: "production",
          ...clearOtel(),
          OTEL_SDK_DISABLED: "1",
          OTEL_EXPORTER_OTLP_ENDPOINT: collector.endpoint,
          OTEL_TRACES_EXPORTER: "otlp"
        },
        processProgram("observability-test")
      )

      expect(collector.requests).toHaveLength(0)
    } finally {
      collector.stop()
    }
  })

  test("ObservabilityLive reports the given service name over OTEL_SERVICE_NAME and sends traces only", async () => {
    const collector = startCollector()

    try {
      await runWithEnv(
        {
          NODE_ENV: "development",
          ...clearOtel(),
          OTEL_EXPORTER_OTLP_ENDPOINT: collector.endpoint,
          OTEL_TRACES_EXPORTER: "otlp",
          OTEL_SERVICE_NAME: "from-environment"
        },
        processProgram("observability-test")
      )

      expect(collector.requests).toHaveLength(1)

      const request = collector.requests[0]

      expect(request?.path).toBe("/v1/traces")
      expect(exportedServiceName(decodeTrace(request))).toBe("observability-test")
    } finally {
      collector.stop()
    }
  })

  test("ObservabilityBrowserLive exports to the given base URL under its own service name", async () => {
    const collector = startCollector()

    try {
      await runWithEnv(
        clearOtel(),
        browserProgram(collector.endpoint, "folding-plane")
      )

      expect(collector.requests).toHaveLength(1)

      const request = collector.requests[0]

      expect(request?.path).toBe("/v1/traces")
      expect(exportedServiceName(decodeTrace(request))).toBe("folding-plane")
    } finally {
      collector.stop()
    }
  })

  test("ObservabilityBrowserLive exports nothing without a base URL", async () => {
    const collector = startCollector()

    try {
      await runWithEnv(clearOtel(), browserProgram(undefined, "folding-plane"))

      expect(collector.requests).toHaveLength(0)
    } finally {
      collector.stop()
    }
  })
})
