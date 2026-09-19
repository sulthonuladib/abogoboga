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
import { BunHttpPlatform, BunServices } from "@effect/platform-bun"
import {
  Chain,
  ChainLink,
  Cryptocurrency,
  Exchange,
  Market,
  WorkerControl,
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
export type AppService = Cryptocurrency | Exchange | Chain | Market | ChainLink | WorkerControl

/**
 * Every application service backed by the in-memory database.
 *
 * @param workerControl - Worker control-plane implementation; defaults to an
 * empty in-memory registry so pages other than `/workers` need no supervisor.
 * @returns The fully provided application-service layer.
 */
export const appServices = (workerControl: Layer.Layer<WorkerControl>) =>
  Layer.mergeAll(Cryptocurrency.layer, Exchange.layer, Chain.layer, Market.layer, ChainLink.layer, workerControl).pipe(
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
 * The default application services, with no exchanges registered for the
 * workers page.
 */
export const AppServices = appServices(WorkerControl.layerTest([]))

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
 * Options for {@link withTestApp}.
 */
export interface TestAppOptions {
  /** Worker control-plane implementation for the workers routes. */
  readonly workerControl?: Layer.Layer<WorkerControl>
}

/**
 * Runs `use` against a freshly built test application and tears it down after.
 *
 * @param use - Test body receiving the running application.
 * @param options - Optional service overrides, such as a worker registry.
 * @returns The test body's result.
 */
export const withTestApp = <A, E>(use: (app: TestApp) => Effect.Effect<A, E>, options?: TestAppOptions) =>
  Effect.gen(function*() {
    const services = yield* Layer.build(
      options?.workerControl === undefined ? AppServices : appServices(options.workerControl)
    )

    const app = WebRoutes.pipe(
      HttpRouter.provideRequest(Layer.succeedContext(services)),
      Layer.provide(Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer))
    )

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
