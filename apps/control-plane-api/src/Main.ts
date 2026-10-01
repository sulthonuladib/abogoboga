/**
 * Control-plane composition root.
 *
 * Wires the persistence adapters, crawler gate/reconcilers, and JSON API
 * handlers into one HTTP server, then runs it with the Bun runtime. Every
 * dependency is chosen here; inner modules stay framework- and vendor-independent.
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
  EventChannel,
  Market,
  MarketHandlers,
  SignalProjector,
  WorkersHandlers,
  apiDocsLayer,
  chainLinkStoreLayer,
  chainStoreLayer,
  cryptocurrencyStoreLayer,
  exchangeDirectoryLayer,
  exchangeStoreLayer,
  marketStoreLayer,
  signalStoreLayer,
  workerControlLiveLayer
} from "@lister/api"
import {
  DomainEvents,
  Gate,
  IdrRate,
  OpportunityReconciler,
  OpportunityWriter,
  Reconciler,
  Supervisor,
  TickIngestion,
  eligibilityStoreLayer,
  opportunityStoreLayer
} from "@lister/crawler"
import { Database } from "@lister/db"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { EventSocketRoute } from "./EventSocket.ts"

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
  opportunityStoreLayer,
  signalStoreLayer
)

const storesProvided = storesLayer.pipe(Layer.provide(databaseLayer))

const eventChannelLayer = EventChannel.layer

const signalProjectorProvided = SignalProjector.layer.pipe(
  Layer.provide(Layer.mergeAll(eventChannelLayer, storesProvided))
)

const signalProjectorLoop = Layer.effectDiscard(
  Effect.flatMap(SignalProjector, (projector) => Effect.forkScoped(projector.start))
).pipe(Layer.provide(signalProjectorProvided))

const eventServices = Layer.mergeAll(signalProjectorProvided, signalProjectorLoop)

const opportunityWriterLayer = OpportunityWriter.layer().pipe(Layer.provide(storesProvided))

const tickIngestionLayer = TickIngestion.layer.pipe(
  Layer.provide(Layer.mergeAll(storesProvided, IdrRate.constantLayer(), opportunityWriterLayer))
)

const supervisorLayer = Supervisor.layer<TickIngestion>({
  workerScript: workerScriptFor("dummy"),
  workerScriptFor,
  onTick: (tick, context) =>
    Effect.flatMap(TickIngestion, (ingestion) =>
      ingestion.ingest(tick, context).pipe(
        Effect.catchTag("TickMappingNotFound", (error) =>
          Effect.logDebug(`no market mapping for ${error.coingeckoId} on ${error.exchangeSlug}`)
        )
      )
    )
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

const supervisorProvided = supervisorLayer.pipe(
  Layer.provide(Layer.mergeAll(DomainEvents.layer, BunWorker.layerPlatform, tickIngestionLayer))
)

const gateProvided = Gate.layer.pipe(
  Layer.provide(Layer.mergeAll(supervisorProvided, DomainEvents.layer))
)

const appServicesProvided = Layer.mergeAll(
  Cryptocurrency.layer,
  Exchange.layer,
  Chain.layer,
  Market.layer,
  ChainLink.layer
).pipe(Layer.provide(storesProvided))

const coinDetailEventsProvided = coinDetailEventsLayer.pipe(Layer.provide(DomainEvents.layer))

const crawlerBase = Layer.mergeAll(supervisorProvided, storesProvided, DomainEvents.layer, gateProvided)

const reconcilerProvided = Reconciler.layer.pipe(Layer.provide(crawlerBase))

const opportunityReconcilerProvided = OpportunityReconciler.layer.pipe(Layer.provide(crawlerBase))

const workerControlProvided = workerControlLiveLayer.pipe(Layer.provide(crawlerBase))

const dependenciesLayer = Layer.mergeAll(
  appServicesProvided,
  coinDetailEventsProvided,
  reconcilerProvided,
  opportunityReconcilerProvided,
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
  EventSocketRoute
)

/**
 * Every route, application service, and crawler runtime with all dependencies
 * provided.
 *
 * The JSON API handlers, the OpenAPI document, and the event socket all draw
 * their services from `dependenciesLayer`.
 */
export const ApplicationLive = routeLayers.pipe(Layer.provide(dependenciesLayer))

const serverLayer = Layer.unwrap(
  Effect.gen(function*() {
    const config = yield* AppConfig

    return BunHttpServer.layer({ port: config.port })
  })
).pipe(Layer.provide(AppConfig.layer))

/**
 * The HTTP server serving the JSON API, the OpenAPI document, and the event
 * socket.
 */
export const HttpLive = HttpRouter.serve(ApplicationLive).pipe(
  Layer.provide(serverLayer),
  Layer.provide(eventServices)
)
