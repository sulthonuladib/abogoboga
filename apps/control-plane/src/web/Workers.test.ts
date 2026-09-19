/**
 * Route-level tests for the workers monitoring page.
 *
 * @module
 */

import { describe, expect, test } from "bun:test"
import { WorkerControl } from "@lister/control-plane-api"
import { Effect } from "effect"
import { bodyOf, htmxRequest, withTestApp, type TestApp } from "./testing/App.ts"

const registry = [
  { id: 1, slug: "dummy-ex" },
  { id: 2, slug: "binance" }
] as const

const withWorkersApp = <A, E>(use: (app: TestApp) => Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(withTestApp(use, { workerControl: WorkerControl.layerTest(registry) }))

describe("workers page", () => {
  test("full load renders the shell, badges, shard slots, polling, and SSE wiring", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        const response = yield* app.request("/workers")
        const body = yield* bodyOf(response)

        expect(response.status).toBe(200)
        expect(body).toContain("<!doctype html")
        expect(body).toContain("Workers")
        expect(body).toContain("dummy-ex")
        expect(body).toContain("binance")
        expect(body).toContain("stopped")
        expect(body).toContain("hx-trigger=\"every 2s\"")
        expect(body).toContain("hx-get=\"/partials/workers\"")
        expect(body).toContain("new EventSource(\"/api/workers/events\")")
      })
    ))

  test("HTMX load returns the page body without the document shell", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        const response = yield* htmxRequest(app, "/workers")
        const body = yield* bodyOf(response)

        expect(body).not.toContain("<!doctype html")
        expect(body).toContain("id=\"workers-list\"")
        expect(response.headers.get("vary")).toBe("HX-Request")
      })
    ))

  test("polling fragment returns only the worker list", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        const response = yield* htmxRequest(app, "/partials/workers")
        const body = yield* bodyOf(response)

        expect(body).not.toContain("<!doctype html")
        expect(body).not.toContain("workers-events")
        expect(body).toContain("id=\"workers-list\"")
        expect(body).toContain("dummy-ex")
      })
    ))

  test("start then duplicate start report success and conflict", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        const started = yield* htmxRequest(app, "/workers/1/start", { method: "POST" })
        const startedBody = yield* bodyOf(started)

        expect(startedBody).toContain("started")
        expect(startedBody).toContain("worker start accepted")
        expect(startedBody).toContain("hx-post=\"/workers/1/stop\"")

        const duplicate = yield* htmxRequest(app, "/workers/1/start", { method: "POST" })
        const duplicateBody = yield* bodyOf(duplicate)

        expect(duplicateBody).toContain("worker is already running")
      })
    ))

  test("stop after start flips the badge back", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        yield* htmxRequest(app, "/workers/2/start", { method: "POST" })

        const stopped = yield* htmxRequest(app, "/workers/2/stop", { method: "POST" })
        const body = yield* bodyOf(stopped)

        expect(body).toContain("worker stop accepted")
        expect(body).toContain("hx-post=\"/workers/2/start\"")
      })
    ))

  test("unknown exchange redirects an HTMX request to /not-found", () =>
    withWorkersApp((app) =>
      Effect.gen(function*() {
        const response = yield* htmxRequest(app, "/workers/999/start", { method: "POST" })

        expect(response.headers.get("hx-redirect")).toBe("/not-found?kind=exchange&id=999")
      })
    ))
})
