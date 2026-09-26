import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { bodyOf, withTestApp } from "./testing/App.ts"

describe("static assets", () => {
  test("serves the layout stylesheet and scripts with content types", async () => {
    const results = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const css = yield* app.request("/static/app.css")
          const js = yield* app.request("/static/htmx.min.js")

          return [
            {
              status: css.status,
              contentType: css.headers.get("content-type"),
              size: (yield* bodyOf(css)).length
            },
            {
              status: js.status,
              contentType: js.headers.get("content-type"),
              size: (yield* bodyOf(js)).length
            }
          ]
        })
      )
    )

    expect(results[0]?.status).toBe(200)
    expect(results[0]?.contentType).toContain("text/css")
    expect(results[0]?.size).toBeGreaterThan(0)
    expect(results[1]?.status).toBe(200)
    expect(results[1]?.contentType).toContain("javascript")
    expect(results[1]?.size).toBeGreaterThan(0)
  })

  test("unknown asset names get a 404", async () => {
    const status = await Effect.runPromise(
      withTestApp((app) =>
        Effect.gen(function*() {
          const response = yield* app.request("/static/../Main.ts")

          return response.status
        })
      )
    )

    expect(status).toBe(404)
  })
})
