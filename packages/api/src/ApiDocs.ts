import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { HttpApiScalar, OpenApi } from "effect/http-api"
import { Api } from "./Api.ts"

/**
 * Route path serving the generated OpenAPI document.
 */
export const openApiJsonPath = "/openapi.json"

/**
 * Route path serving the Scalar API reference UI.
 */
export const docsPath = "/docs"

/**
 * Routes serving the generated OpenAPI document and the Scalar reference UI.
 *
 * Both routes are generated from the same {@link Api} definitions that serve
 * traffic, so the documentation cannot drift from the handlers. The layer adds
 * routes to an `HttpRouter`; compose it with the API and SSR route layers at
 * the composition root.
 */
export const layer: Layer.Layer<never, never, HttpRouter.HttpRouter> = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    openApiJsonPath,
    Effect.sync(() => HttpServerResponse.jsonUnsafe(OpenApi.fromApi(Api)))
  ),
  HttpApiScalar.layer(Api, { path: docsPath })
)
