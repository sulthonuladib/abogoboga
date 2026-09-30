/**
 * Control-plane process entrypoint.
 *
 * @module
 */

import { BunRuntime } from "@effect/platform-bun"
import { ObservabilityLive } from "@lister/observability"
import { Layer } from "effect"
import { HttpLive } from "./Main.ts"

BunRuntime.runMain(
  Layer.launch(HttpLive.pipe(Layer.provide(ObservabilityLive({ serviceName: "control-plane" }))))
)
