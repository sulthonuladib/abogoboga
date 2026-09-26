/**
 * Workers monitoring routes: the page, its polling fragment, and start/stop
 * transitions backed by the `WorkerControl` port.
 *
 * @module
 */

import { WorkerControl, type WorkerConflict, type WorkerControlFailure, type WorkerExchangeNotFound, type WorkerStatus } from "@lister/api"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { ToastOob } from "../Fragments.ts"
import { EntityMiss, fragmentResponse, isHtmxRequest, pageResponse, route, type RouteError } from "../Http.ts"
import { html } from "../Html.ts"
import { Layout } from "../Layout.ts"
import { decodeId } from "../RequestInput.ts"
import { WorkersBody, WorkersList } from "../views/Workers.ts"

const workersPageRoute = route("GET", "/workers", (request) =>
  Effect.gen(function*() {
    const control = yield* WorkerControl
    const statuses = yield* control.statuses
    const body = WorkersBody(statuses)

    if (isHtmxRequest(request)) return fragmentResponse(body)

    return pageResponse(Layout({ title: "Workers", active: "/workers", children: body }))
  })
)

const workersPartialRoute = route("GET", "/partials/workers", () =>
  Effect.gen(function*() {
    const control = yield* WorkerControl
    const statuses = yield* control.statuses

    return fragmentResponse(WorkersList(statuses))
  })
)

type TransitionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: "warning" | "error"; readonly message: string }

const transitionRoute = (action: "start" | "stop") =>
  route("POST", `/workers/:id/${action}`, () =>
    Effect.gen(function*() {
      const pathParams = yield* HttpRouter.params
      const exchangeId = yield* decodeId(pathParams["id"], Schema.Int, "exchange")
      const control = yield* WorkerControl

      const run: (
        id: number
      ) => Effect.Effect<WorkerStatus, WorkerConflict | WorkerExchangeNotFound | WorkerControlFailure> =
        action === "start" ? control.start : control.stop

      const outcome = yield* run(exchangeId).pipe(
        Effect.map((): TransitionOutcome => ({ ok: true })),
        Effect.catchTags({
          WorkerConflict: (error): Effect.Effect<TransitionOutcome, RouteError> =>
            Effect.succeed({ ok: false, kind: "warning", message: error.message }),
          WorkerExchangeNotFound: (): Effect.Effect<TransitionOutcome, RouteError> =>
            Effect.fail(new EntityMiss({ kind: "exchange", id: String(exchangeId) })),
          WorkerControlFailure: (error): Effect.Effect<TransitionOutcome, RouteError> =>
            Effect.succeed({ ok: false, kind: "error", message: error.message })
        })
      )

      const statuses = yield* control.statuses

      const toast = ToastOob({
        kind: outcome.ok ? "success" : outcome.kind,
        message: outcome.ok ? `worker ${action} accepted` : outcome.message
      })

      return fragmentResponse(html`${WorkersList(statuses)}${toast}`)
    })
  )

/**
 * Workers monitoring page, polling fragment, and start/stop transitions.
 */
export const WorkersRoutes = Layer.mergeAll(
  workersPageRoute,
  workersPartialRoute,
  transitionRoute("start"),
  transitionRoute("stop")
)
