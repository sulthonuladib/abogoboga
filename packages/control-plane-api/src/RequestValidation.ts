import { Effect, Schema } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

/**
 * Expected failure: the request did not match the endpoint schema.
 *
 * Emitted for malformed params, headers, query, or payload with HTTP status
 * 422, preserving the legacy API's validation semantics.
 */
export class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  {
    kind: Schema.Literals(["params", "headers", "query", "payload"]),
    message: Schema.String
  },
  { httpApiStatus: 422 }
) {}

/**
 * Middleware that maps request-decoding failures to {@link InvalidRequest}.
 *
 * Response-encoding failures are re-failed unchanged so a server bug never
 * masquerades as client input.
 */
export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
  "lister/control-plane-api/RequestValidation",
  { error: InvalidRequest }
) {}

const requestKinds = {
  Params: "params",
  Headers: "headers",
  Query: "query",
  Payload: "payload"
} as const

/**
 * Layer implementing {@link RequestValidation}.
 */
export const RequestValidationLive = HttpApiMiddleware.layerSchemaErrorTransform(RequestValidation, (schemaError) => {
  if (schemaError.kind === "Body" || schemaError.kind === "ResponseHeaders") {
    return Effect.fail(schemaError)
  }

  return Effect.fail(
    new InvalidRequest({
      kind: requestKinds[schemaError.kind],
      message: schemaError.cause.message
    })
  )
})
