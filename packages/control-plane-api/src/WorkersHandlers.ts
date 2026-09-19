import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { WorkerControl } from "./WorkerControl.ts"
import { RequestValidationLive } from "./RequestValidation.ts"

/**
 * Worker group handlers over the {@link WorkerControl} port.
 *
 * The port owns conflict and not-found decisions, so handlers only unwrap the
 * handler context and delegate; the production port is provided at the
 * composition root and tests provide an in-memory implementation.
 */
export const WorkersHandlers = HttpApiBuilder.group(
  Api,
  "workers",
  Effect.fn(function*(handlers) {
    const control = yield* WorkerControl

    return handlers.handleAll({
      list: () => control.statuses,
      events: () => Effect.succeed(control.events),
      start: ({ params }) => control.start(params.exchangeId),
      stop: ({ params }) => control.stop(params.exchangeId)
    })
  })
).pipe(Layer.provideMerge(RequestValidationLive))
