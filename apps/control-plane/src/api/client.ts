import { Api } from "@lister/api/client"
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
