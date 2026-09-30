import { Api } from "@lister/api/client"
import { ObservabilityBrowserLive } from "@lister/observability"
import { FetchHttpClient } from "effect/unstable/http"
import { AtomHttpApi } from "effect/unstable/reactivity"

/**
 * Typed atom client for the control-plane JSON API.
 *
 * Queries are keyed by their request payload and can invalidate through
 * reactivity keys; mutations run through the same client. Both resolve against
 * the current origin, so the Vite dev proxy and the production server expose
 * identical paths.
 */
export class ApiClient extends AtomHttpApi.Service<ApiClient>()("ApiClient", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: new URL(globalThis.location.origin)
}) {}

// NOTE: the runtime factory merges an added global layer into the context every
// atom runs in, and reads that layer lazily, so registering here reaches every
// atom the app creates afterwards. `FetchHttpClient` propagates `traceparent` by
// default, unlike the Foldkit client, so an atom's request continues the browser
// trace into the API's request span. An absent collector URL registers a layer
// that exports nothing.
ApiClient.runtime.factory.addGlobalLayer(
  ObservabilityBrowserLive({
    baseUrl: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: "control-plane-web"
  })
)
