/**
 * Static asset routes: the CSS and HTMX bundles referenced by the layout.
 *
 * Served from the checked-in `public/static` directory under the `/static`
 * prefix via the platform static server (MIME types, traversal-safe root,
 * 404 for unknown files).
 *
 * @module
 */

import { HttpStaticServer } from "effect/unstable/http"
import { fileURLToPath } from "node:url"

/**
 * Static asset routes, mounted at `/static`.
 *
 * `FileSystem`, `Path`, and the HTTP platform are provided at the composition
 * root; a missing asset directory fails layer build with `PlatformError`.
 */
export const StaticRoutes = HttpStaticServer.layer({
  root: fileURLToPath(new URL("../../../../../public/static/", import.meta.url)),
  prefix: "/static"
})
