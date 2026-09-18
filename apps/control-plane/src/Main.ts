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

import { BunHttpServer, BunServices } from "@effect/platform-bun"
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

const workersRoot = fileURLToPath(new URL("../../workers/", import.meta.url))

/**
 * Resolve the worker entrypoint for one exchange.
 *
 * Falls back to the synthetic dummy worker when an exchange has no app yet, so
 * a missing owner implementation surfaces as a normal worker failure instead of
 * a supervisor crash.
 *
 * @param exchangeSlug - Exchange slug from the database.
 * @returns Absolute path of the worker entrypoint.
 */
export const workerScriptFor = (exchangeSlug: string): string => {
  const script = `${workersRoot}${exchangeSlug}/src/index.ts`

  return existsSync(script) ? script : `${workersRoot}dummy/src/index.ts`
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

const appServicesLayer = Layer.mergeAll(
  Cryptocurrency.layer,
  Exchange.layer,
  Chain.layer,
  Market.layer,
  ChainLink.layer
).pipe(Layer.provide(storesLayer))

const reconcilerLayer = Reconciler.layer.pipe(Layer.provide(Layer.mergeAll(supervisorLayer, storesLayer, DomainEvents.layer)))

const workerControlLayer = workerControlLiveLayer.pipe(
  Layer.provide(Layer.mergeAll(supervisorLayer, storesLayer, DomainEvents.layer))
)

const dependenciesLayer = Layer.mergeAll(
  appServicesLayer,
  coinDetailEventsLayer.pipe(Layer.provide(DomainEvents.layer)),
  reconcilerLayer,
  workerControlLayer,
  supervisorLayer,
  storesLayer,
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

/**
 * Every route, application service, and crawler runtime with all dependencies
 * provided.
 */
export const ApplicationLive = routeLayers.pipe(Layer.provide(dependenciesLayer))

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
