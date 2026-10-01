import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import {
  WorkerConflict,
  WorkerControlFailure,
  WorkerEvent,
  WorkerExchangeNotFound,
  WorkerStatus
} from "./WorkerControl.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * OpenAPI annotations helper for one endpoint.
 *
 * @param identifier - Stable operation id shown in the generated document.
 * @param summary - Short human summary.
 * @param description - Longer human description.
 * @returns Annotation context merged onto the endpoint.
 */
const documented = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

/**
 * HTTP API group for worker activation, monitoring, and the lifecycle stream.
 *
 * Start and stop reject transitions that are already satisfied with a 409
 * conflict and emit no event; unknown exchanges return 404. The SSE endpoint
 * replays recent lifecycle events before continuing with live ones.
 */
export class WorkersApiGroup extends HttpApiGroup.make("workers")
  .add(
    HttpApiEndpoint.get("list", "/workers", {
      success: Schema.Array(WorkerStatus)
    }).annotateMerge(
      documented("workers.list", "List worker status", "Status for every exchange, running or not.")
    ),
    HttpApiEndpoint.get("events", "/workers/events", {
      success: HttpApiSchema.StreamSse({ data: WorkerEvent })
    }).annotateMerge(
      documented("workers.events", "Worker lifecycle stream", "Recent worker lifecycle events followed by live events.")
    ),
    HttpApiEndpoint.post("start", "/workers/:exchangeId/start", {
      params: { exchangeId: Schema.Int },
      success: WorkerStatus,
      error: [WorkerConflict, WorkerExchangeNotFound, WorkerControlFailure]
    }).annotateMerge(
      documented("workers.start", "Start worker", "Start an exchange worker, rejecting an already-running worker.")
    ),
    HttpApiEndpoint.post("stop", "/workers/:exchangeId/stop", {
      params: { exchangeId: Schema.Int },
      success: WorkerStatus,
      error: [WorkerConflict, WorkerExchangeNotFound, WorkerControlFailure]
    }).annotateMerge(
      documented("workers.stop", "Stop worker", "Stop an exchange worker, rejecting an already-stopped worker.")
    )
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Workers",
      description: "Worker activation, monitoring, and lifecycle events."
    })
  ) {}
