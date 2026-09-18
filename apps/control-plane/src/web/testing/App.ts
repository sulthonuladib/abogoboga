/**
 * Test harness for the SSR routes.
 *
 * Builds the real Phase-5 application services over an in-memory PGlite
 * database (running the shipped Drizzle migrations), then exposes the router
 * through `HttpRouter.toWebHandler` so tests exercise the public HTTP surface.
 *
 * @module
 */

import { Database } from "@lister/db"
import {
  Chain,
  ChainLink,
  Cryptocurrency,
  Exchange,
  Market,
  chainLinkStoreLayer,
  chainStoreLayer,
  cryptocurrencyStoreLayer,
  exchangeStoreLayer,
  marketStoreLayer
} from "@lister/control-plane-api"
import { Context, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { WebRoutes } from "../Routes.ts"

/**
 * Application services the SSR routes depend on.
 */
export type AppService = Cryptocurrency | Exchange | Chain | Market | ChainLink

/**
 * Every application service backed by the in-memory database.
 */
export const AppServices = Layer.mergeAll(
  Cryptocurrency.layer,
  Exchange.layer,
  Chain.layer,
  Market.layer,
  ChainLink.layer
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      cryptocurrencyStoreLayer,
      exchangeStoreLayer,
      chainStoreLayer,
      marketStoreLayer,
      chainLinkStoreLayer
    )
  ),
  Layer.provideMerge(Database.layerMemory())
)

/**
 * A running test application: an HTTP handler plus the seeded service context.
 */
export type TestApp = {
  /** Sends a request to the mounted SSR router. */
  readonly request: (path: string, init?: RequestInit) => Effect.Effect<Response>
  /** The service context, for seeding rows before a request. */
  readonly services: Context.Context<AppService>
}

/**
 * Runs `use` against a freshly built test application and tears it down after.
 *
 * @param use - Test body receiving the running application.
 * @returns The test body's result.
 */
export const withTestApp = <A, E>(use: (app: TestApp) => Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const services = yield* Layer.build(AppServices)
    const app = WebRoutes.pipe(HttpRouter.provideRequest(Layer.succeedContext(services)))
    const { handler, dispose } = HttpRouter.toWebHandler(app, { disableLogger: true })

    const request = (path: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(`http://localhost${path}`, init)))

    return yield* use({ request, services }).pipe(Effect.ensuring(Effect.promise(() => dispose())))
  }).pipe(Effect.scoped)

/**
 * Reads a response body as text.
 *
 * @param response - The response to read.
 * @returns The body text.
 */
export const bodyOf = (response: Response): Effect.Effect<string> =>
  Effect.promise(() => response.text())

/**
 * Sends an HTMX request.
 *
 * @param app - Running test application.
 * @param path - Request path.
 * @param init - Optional method and body overrides.
 * @returns The response.
 */
export const htmxRequest = (
  app: TestApp,
  path: string,
  init?: RequestInit
): Effect.Effect<Response> => {
  const headers = new Headers(init?.headers)

  headers.set("hx-request", "true")

  return app.request(path, { ...init, headers })
}

/**
 * Builds a URL-encoded form body from a record.
 *
 * @param fields - Form field values.
 * @returns The encoded body.
 */
export const formBody = (fields: Record<string, string>): URLSearchParams => new URLSearchParams(fields)
