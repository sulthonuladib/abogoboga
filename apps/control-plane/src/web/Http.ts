/**
 * Shared HTTP plumbing for the server-rendered routes: request classification,
 * the failure vocabulary handlers re-fail with, and the response builders that
 * turn those failures into pages or fragments.
 *
 * @module
 */

import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { ErrorFragment } from "./Fragments.ts"
import type { RawHtml } from "./Html.ts"

/**
 * A requested entity does not exist.
 *
 * Full page loads redirect to `/not-found`; HTMX requests receive an
 * `HX-Redirect` header so the browser navigates without swapping a fragment.
 */
export class EntityMiss extends Schema.TaggedError<EntityMiss>()("EntityMiss", {
  kind: Schema.String,
  id: Schema.String
}) {}

/**
 * An expected failure rendered inline next to the control that caused it.
 *
 * `retarget` optionally names the element HTMX should swap instead of the
 * triggering element's default target, and `reswap` overrides the swap
 * strategy (for example `innerHTML`).
 */
export class InlineProblem extends Schema.TaggedError<InlineProblem>()("InlineProblem", {
  message: Schema.String,
  retarget: Schema.optionalKey(Schema.String),
  reswap: Schema.optionalKey(Schema.String)
}) {}

/**
 * Failure channel every SSR route may expose before the route wrapper converts
 * it into a response.
 */
export type RouteError = EntityMiss | InlineProblem | Schema.SchemaError | HttpServerError.HttpServerError

/**
 * Builds a handler for an application-service reason the calling route cannot
 * produce.
 *
 * Such a reason means the workspace invariant behind the endpoint was violated,
 * so it is a defect rather than a recoverable failure.
 *
 * @param service - Service name used in the diagnostic message.
 * @param operation - Operation name used in the diagnostic message.
 * @returns A handler that dies with a descriptive error.
 */
export const unexpectedReason =
  (service: string, operation: string) =>
  (reason: { readonly _tag: string }): Effect.Effect<never> =>
    Effect.die(new Error(`${service}.${operation} reported unexpected reason ${reason._tag}`))

/**
 * Returns whether the request came from HTMX without restoring history.
 *
 * @param request - Current server request.
 * @returns `true` for a live HTMX request.
 */
export const isHtmxRequest = (request: HttpServerRequest.HttpServerRequest): boolean =>
  request.headers["hx-request"] !== undefined && request.headers["hx-history-restore-request"] === undefined

/**
 * Builds the `/not-found` URL for a miss.
 *
 * @param options - Context describing what was requested.
 * @returns The `/not-found` location with only the supplied query parameters.
 */
export const notFoundUrl = (options: {
  readonly from?: string | undefined
  readonly kind?: string | undefined
  readonly id?: string | undefined
}): string => {
  const params = new URLSearchParams()

  if (options.from !== undefined && options.from !== "") params.set("from", options.from)

  if (options.kind !== undefined && options.kind !== "") params.set("kind", options.kind)

  if (options.id !== undefined && options.id !== "") params.set("id", options.id)

  const query = params.toString()

  return query === "" ? "/not-found" : `/not-found?${query}`
}

/**
 * Renders a full HTML document response.
 *
 * @param body - Complete document markup.
 * @returns The HTML response.
 */
export const pageResponse = (body: RawHtml): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.html(body.value)

/**
 * Renders an HTML fragment response.
 *
 * Every fragment response carries `Vary: HX-Request` so caches never serve a
 * fragment for a full page load. `retarget` and `reswap` add the corresponding
 * HTMX response headers.
 *
 * @param body - Fragment markup.
 * @param options - Optional status and HTMX swap overrides.
 * @returns The HTML response.
 */
export const fragmentResponse = (
  body: RawHtml,
  options?: {
    readonly status?: number | undefined
    readonly retarget?: string | undefined
    readonly reswap?: string | undefined
  }
): HttpServerResponse.HttpServerResponse => {
  let response = HttpServerResponse.html(body.value).pipe(
    HttpServerResponse.setHeader("vary", "HX-Request")
  )

  if (options?.status !== undefined) {
    response = response.pipe(HttpServerResponse.setStatus(options.status))
  }

  if (options?.retarget === undefined) return response

  const retargeted = response.pipe(HttpServerResponse.setHeader("hx-retarget", options.retarget))

  if (options.reswap === undefined) return retargeted

  return retargeted.pipe(HttpServerResponse.setHeader("hx-reswap", options.reswap))
}

/**
 * Renders an error alert, optionally with an error status.
 *
 * @param message - Operator-facing failure description.
 * @param status - HTTP status; defaults to 200 so HTMX swaps it inline.
 * @returns The HTML response.
 */
export const errorResponse = (message: string, status = 200): HttpServerResponse.HttpServerResponse =>
  fragmentResponse(ErrorFragment({ message }), { status })

/**
 * Converts an entity miss into a redirect: 302 for full loads, `HX-Redirect`
 * for HTMX requests.
 *
 * @param request - Current server request.
 * @param miss - Kind and id of the missing entity.
 * @returns The redirect or redirect-header response.
 */
export const missResponse = (
  request: HttpServerRequest.HttpServerRequest,
  miss: EntityMiss
): HttpServerResponse.HttpServerResponse => {
  const location = notFoundUrl({ kind: miss.kind, id: miss.id })

  if (isHtmxRequest(request)) {
    return HttpServerResponse.empty({
      status: 200,
      headers: { vary: "HX-Request", "hx-redirect": location }
    })
  }

  return HttpServerResponse.redirect(location, { status: 302 })
}

/**
 * Registers a route whose handler failures are converted into responses.
 *
 * `EntityMiss` becomes a redirect, `InlineProblem` an inline alert (with an
 * optional retarget), a schema decode error a 400 alert, and any other typed
 * failure a 500 alert after being logged, so a request can never crash the
 * server.
 *
 * @param method - HTTP method to register.
 * @param path - Router path pattern.
 * @param handler - Request handler returning a response effect.
 * @returns A layer adding the route to the router.
 */
export const route = <R>(
  method: "GET" | "POST" | "DELETE",
  path: `/${string}`,
  handler: (
    request: HttpServerRequest.HttpServerRequest
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, RouteError, R>
) =>
  HttpRouter.add(method, path, (request) =>
    handler(request).pipe(
      Effect.catchTags({
        EntityMiss: (miss) => Effect.succeed(missResponse(request, miss)),
        InlineProblem: (problem) =>
          Effect.succeed(
            fragmentResponse(ErrorFragment({ message: problem.message }), {
              retarget: problem.retarget,
              reswap: problem.reswap
            })
          )
      }),
      Effect.catchIf(Schema.isSchemaError, (error) =>
        Effect.succeed(errorResponse(`invalid request: ${error.message}`, 400))
      ),
      Effect.catch((error) =>
        Effect.gen(function*() {
          yield* Effect.logError("SSR route failed", error)

          return errorResponse("something went wrong", 500)
        })
      )
    )
  )
