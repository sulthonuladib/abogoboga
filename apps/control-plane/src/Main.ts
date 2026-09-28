/**
 * Control-plane composition root.
 *
 * Wires the persistence adapters, crawler supervisor/reconciler, JSON API
 * handlers, and SSR routes into one HTTP server, then runs it with the Bun
 * runtime. Every dependency is chosen here; inner modules stay framework- and
 * vendor-independent.
 *
 * @module
 */

import { BunHttpServer, BunServices, BunWorker } from "@effect/platform-bun"
import { AppConfig } from "@lister/config"
import {
  Api,
  Chain,
  ChainHandlers,
  ChainLink,
  ChainLinkHandlers,
  CoinDetailEvents,
  Cryptocurrency,
  CryptocurrencyHandlers,
  Exchange,
  ExchangeHandlers,
  Market,
  MarketHandlers,
  WorkersHandlers,
  apiDocsLayer,
  chainLinkStoreLayer,
  chainStoreLayer,
  cryptocurrencyStoreLayer,
  exchangeDirectoryLayer,
  exchangeStoreLayer,
  marketStoreLayer,
  workerControlLiveLayer
} from "@lister/control-plane-api"
import { DomainEvents, Reconciler, Supervisor, eligibilityStoreLayer, orderbookStoreLayer } from "@lister/crawler"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { WebRoutes } from "./web/Routes.ts"

const workerEntrypointFor = (exchangeSlug: string): string =>
  fileURLToPath(new URL(`../../workers/${exchangeSlug}/src/index.ts`, import.meta.url))

/**
 * Resolve the Bun worker module for one exchange.
 *
 * Falls back to the synthetic dummy worker when an exchange has no app yet, so
 * a missing owner implementation surfaces as a normal worker failure instead of
 * a supervisor crash.
 *
 * @param exchangeSlug - Exchange slug from the database.
 * @returns Absolute path of the worker module, or the dummy fallback.
 */
export const workerScriptFor = (exchangeSlug: string): string => {
  const entrypoint = workerEntrypointFor(exchangeSlug)

  return existsSync(entrypoint) ? entrypoint : workerEntrypointFor("dummy")
}

const databaseLayer = Database.layer().pipe(Layer.provide(AppConfig.layer))

const storesLayer = Layer.mergeAll(
  cryptocurrencyStoreLayer,
  exchangeStoreLayer,
  chainStoreLayer,
  marketStoreLayer,
  chainLinkStoreLayer,
  exchangeDirectoryLayer,
  eligibilityStoreLayer,
  orderbookStoreLayer
)

const supervisorLayer = Supervisor.layer({
  workerScript: workerScriptFor("dummy"),
  workerScriptFor
})

const coinDetailEventsLayer = Layer.effect(
  CoinDetailEvents,
  Effect.gen(function*() {
    const events = yield* DomainEvents

    return CoinDetailEvents.of({
      publish: (change) =>
        events.publish({
          type: "coin-detail-changed",
          exchangeId: change.exchangeId,
          exchangeCryptocurrencyId: change.exchangeCryptocurrencyId,
          cryptocurrencyId: change.cryptocurrencyId
        })
    })
  })
)

const storesProvided = storesLayer.pipe(Layer.provide(databaseLayer))

const supervisorProvided = supervisorLayer.pipe(
  Layer.provide(Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform))
)

const appServicesProvided = Layer.mergeAll(
  Cryptocurrency.layer,
  Exchange.layer,
  Chain.layer,
  Market.layer,
  ChainLink.layer
).pipe(Layer.provide(storesProvided))

const coinDetailEventsProvided = coinDetailEventsLayer.pipe(Layer.provide(DomainEvents.layer))

const crawlerBase = Layer.mergeAll(supervisorProvided, storesProvided, DomainEvents.layer)

const reconcilerProvided = Reconciler.layer.pipe(Layer.provide(crawlerBase))

const workerControlProvided = workerControlLiveLayer.pipe(Layer.provide(crawlerBase))

const dependenciesLayer = Layer.mergeAll(
  appServicesProvided,
  coinDetailEventsProvided,
  reconcilerProvided,
  workerControlProvided,
  supervisorProvided,
  storesProvided,
  DomainEvents.layer,
  databaseLayer,
  BunServices.layer,
  AppConfig.layer
)

const handlersLayer = Layer.mergeAll(
  CryptocurrencyHandlers,
  ExchangeHandlers,
  ChainHandlers,
  MarketHandlers,
  ChainLinkHandlers,
  WorkersHandlers
)

const routeLayers = Layer.mergeAll(
  HttpApiBuilder.layer(Api).pipe(Layer.provide(handlersLayer)),
  apiDocsLayer,
  WebRoutes
)

const requestServices = Layer.mergeAll(appServicesProvided, workerControlProvided)

/**
 * Every route, application service, and crawler runtime with all dependencies
 * provided.
 *
 * SSR routes read application services per request, so they are supplied
 * through `HttpRouter.provideRequest`; remaining layer requirements
 * (`Database`, worker control) are satisfied from `dependenciesLayer`.
 */
export const ApplicationLive = routeLayers.pipe(
  HttpRouter.provideRequest(requestServices),
  Layer.provide(dependenciesLayer)
)

const serverLayer = Layer.unwrap(
  Effect.gen(function*() {
    const config = yield* AppConfig

    return BunHttpServer.layer({ port: config.port })
  })
).pipe(Layer.provide(AppConfig.layer))

/**
 * The HTTP server serving API and SSR routes.
 */
export const HttpLive = HttpRouter.serve(ApplicationLive).pipe(Layer.provide(serverLayer))
