import { Config, Effect, Layer, Logger, References } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Otlp, OtlpSerialization } from "effect/unstable/observability"

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
 * Application observability layer: console logging plus OTLP export of logs,
 * traces, and metrics.
 *
 * With no collector configured (or `OTEL_SDK_DISABLED=1`) the OTLP exporters
 * are clean no-ops and the service runs on local logging only.
 *
 * Provide this layer last at the composition root so spans and logs created
 * while building other layers are still exported.
 */
export const ObservabilityLive: Layer.Layer<never, Config.ConfigError> = Layer.mergeAll(
  LoggerLive,
  Otlp.layerFromConfig()
).pipe(
  Layer.provideMerge(OtlpSerialization.layerJson),
  Layer.provideMerge(FetchHttpClient.layer)
)
