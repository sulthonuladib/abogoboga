/**
 * Static routes for the compiled browser application.
 *
 * `apps/control-plane/dist` is served at the site root with a single-page
 * application fallback, so deep links and reloads resolve into the client
 * router. Content-hashed assets under `/assets` are served with immutable
 * caching, while the application shell is revalidated so a new build is picked
 * up immediately.
 *
 * The fallback only answers extension-less requests that accept HTML, and the
 * API, docs, and asset routes are more specific, so `/api/*`, `/docs`,
 * `/openapi.json`, and missing asset files never receive the shell.
 *
 * @module
 */

import { Layer } from "effect"
import { HttpStaticServer } from "effect/unstable/http"
import { fileURLToPath } from "node:url"

/**
 * Absolute path of the built single-page application.
 */
export const spaDistPath = fileURLToPath(new URL("../../control-plane/dist", import.meta.url))

/**
 * Every static route for the browser application, unprovided.
 *
 * Requires `FileSystem`, `Path`, and the HTTP platform, which the composition
 * root provides through `BunServices`.
 */
export const SpaRoutes = Layer.mergeAll(
  HttpStaticServer.layer({
    root: spaDistPath,
    index: "index.html",
    spa: true,
    cacheControl: "no-cache"
  }),
  // The router strips `/assets` before the handler runs, so the asset layer's
  // root is the assets directory itself rather than the dist root.
  HttpStaticServer.layer({
    root: `${spaDistPath}/assets`,
    prefix: "/assets",
    cacheControl: "public, max-age=31536000, immutable"
  })
)
