import { Config, Effect, Layer, Logger, References } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Otlp, OtlpSerialization, OtlpTracer } from "effect/unstable/observability"

/**
 * Console logger layer: human-readable lines in development, one JSON object
 * per line in production.
 *
 * Reads `NODE_ENV` (default `"development"`) and `LOG_LEVEL` (default
 * `"Info"`) from the environment.
 */
export const LoggerLive: Layer.Layer<never, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function*() {
    const environment = yield* Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
      Config.withDefault("development")
    )

    const minimumLogLevel = yield* Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info"))

    const consoleLogger = environment === "production" ? Logger.consoleJson : Logger.defaultLogger

    return Layer.mergeAll(
      Logger.layer([consoleLogger]),
      Layer.succeed(References.MinimumLogLevel, minimumLogLevel)
    )
  })
)

/**
 * Application observability layer for a Bun or Node process: console logging
 * plus OTLP export of traces under the given service name.
 *
 * Reads `OTEL_*` from the environment. Trace export is enabled by
 * `OTEL_TRACES_EXPORTER=otlp`; log and metric export stay off, so no log or
 * metric payloads are sent. With no collector endpoint configured (or
 * `OTEL_SDK_DISABLED=1`) the exporter is a clean no-op and the service runs on
 * local logging only.
 *
 * Provide this layer last at the composition root so spans and logs created
 * while building other layers are still exported.
 *
 * @param options - Service identity reported on every exported span.
 */
export const ObservabilityLive = (options: {
  readonly serviceName: string
}): Layer.Layer<never, Config.ConfigError> =>
  Layer.mergeAll(
    LoggerLive,
    Otlp.layerFromConfig({ resource: { serviceName: options.serviceName } })
  ).pipe(
    Layer.provideMerge(OtlpSerialization.layerJson),
    Layer.provideMerge(FetchHttpClient.layer)
  )

/**
 * Application observability layer for a browser: OTLP export of traces under
 * the given service name.
 *
 * A browser has no `process.env`, so the collector URL and service name are
 * explicit rather than read from OpenTelemetry configuration. Traces only: the
 * layer installs the tracer and nothing else, so no log or metric payloads are
 * sent. Read the base URL from the Vite environment at the call site. An absent
 * base URL builds a layer that exports nothing, which is how a checkout with no
 * collector runs.
 *
 * @param options - Collector base URL and service identity. The exporter
 *   appends `/v1/traces` to the base URL.
 */
export const ObservabilityBrowserLive = (options: {
  readonly baseUrl: string | undefined
  readonly serviceName: string
}): Layer.Layer<never, never> => {
  if (options.baseUrl === undefined || options.baseUrl === "") {
    return Layer.empty
  }

  return OtlpTracer.layer({
    url: tracesUrl(options.baseUrl),
    resource: { serviceName: options.serviceName }
  }).pipe(
    Layer.provideMerge(OtlpSerialization.layerJson),
    Layer.provideMerge(FetchHttpClient.layer)
  )
}

const tracesUrl = (baseUrl: string): string => {
  const url = new URL(baseUrl)
  const slash = url.pathname.endsWith("/") ? "" : "/"
  url.pathname += `${slash}v1/traces`

  return url.toString()
}
