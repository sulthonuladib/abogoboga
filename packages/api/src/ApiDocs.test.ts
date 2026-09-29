import { describe, expect, test } from "bun:test"
import { Database } from "@lister/db"
import { Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "./Api.ts"
import { docsPath, layer as ApiDocsLayer, openApiJsonPath } from "./ApiDocs.ts"
import { ChainHandlers } from "./ChainHandlers.ts"
import { ChainLinkHandlers } from "./ChainLinkHandlers.ts"
import { CoinDetailEvents } from "./CoinDetailEvents.ts"
import { CryptocurrencyHandlers } from "./CryptocurrencyHandlers.ts"
import { ExchangeHandlers } from "./ExchangeHandlers.ts"
import { MarketHandlers } from "./MarketHandlers.ts"
import { WorkerControl } from "./WorkerControl.ts"
import { WorkersHandlers } from "./WorkersHandlers.ts"

/** Operation keys inspected on each documented path. */
const EndpointItem = Schema.Struct({
  get: Schema.optional(Schema.Unknown),
  post: Schema.optional(Schema.Unknown),
  patch: Schema.optional(Schema.Unknown),
  delete: Schema.optional(Schema.Unknown)
})

/** Minimal shape of the served OpenAPI document. */
const OpenApiDocument = Schema.Struct({
  paths: Schema.Record(Schema.String, EndpointItem)
})

/**
 * Every endpoint declared by the 5.1 and 5.3 groups, keyed by documented path.
 */
const expectedEndpoints = {
  "/api/cryptocurrency/add": ["post"],
  "/api/cryptocurrency/list": ["post"],
  "/api/cryptocurrency/stats": ["post"],
  "/api/cryptocurrency/metadata": ["post"],
  "/api/cryptocurrency/{id}": ["get", "patch", "delete"],
  "/api/exchange/add": ["post"],
  "/api/exchange/list": ["post"],
  "/api/exchange/{id}": ["get", "patch", "delete"],
  "/api/chain/add": ["post"],
  "/api/chain/find-or-create": ["post"],
  "/api/chain/list": ["post"],
  "/api/chain/{id}": ["get", "patch", "delete"],
  "/api/exchange-cryptocurrency/assign": ["post"],
  "/api/exchange-cryptocurrency/list": ["post"],
  "/api/exchange-cryptocurrency/count": ["post"],
  "/api/exchange-cryptocurrency/{id}": ["get", "patch", "delete"],
  "/api/exchange-cryptocurrency-chain/add": ["post"],
  "/api/exchange-cryptocurrency-chain/list": ["post"],
  "/api/exchange-cryptocurrency-chain/{id}": ["get", "patch", "delete"],
  "/api/workers": ["get"],
  "/api/workers/events": ["get"],
  "/api/workers/{exchangeId}/start": ["post"],
  "/api/workers/{exchangeId}/stop": ["post"]
} as const

const ApiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(CryptocurrencyHandlers),
  Layer.provide(ExchangeHandlers),
  Layer.provide(ChainHandlers),
  Layer.provide(MarketHandlers),
  Layer.provide(ChainLinkHandlers),
  Layer.provide(
    WorkersHandlers.pipe(
      Layer.provide(WorkerControl.layerTest([{ id: 1, slug: "indodax" }]))
    )
  ),
  Layer.provide(CoinDetailEvents.layerNoop),
  Layer.provide(Database.layerMemory()),
  Layer.provide(HttpServer.layerServices)
)

const AppLayer = Layer.mergeAll(ApiLayer, ApiDocsLayer)

describe("API documentation", () => {
  test("serves every endpoint in the generated OpenAPI document", async () => {
    const { handler, dispose } = HttpRouter.toWebHandler(AppLayer, { disableLogger: true })

    try {
      const response = await handler(new Request(`http://localhost${openApiJsonPath}`))

      expect(response.status).toBe(200)

      const document = Schema.decodeUnknownSync(OpenApiDocument)(await response.json())

      expect(Object.keys(document.paths)).toHaveLength(Object.keys(expectedEndpoints).length)

      for (const [path, methods] of Object.entries(expectedEndpoints)) {
        const item = document.paths[path]

        expect(item).toBeDefined()

        for (const method of methods) {
          expect(item?.[method]).toBeDefined()
        }
      }
    } finally {
      await dispose()
    }
  })

  test("serves the Scalar reference UI at /docs", async () => {
    const { handler, dispose } = HttpRouter.toWebHandler(AppLayer, { disableLogger: true })

    try {
      const response = await handler(new Request(`http://localhost${docsPath}`))

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")

      const html = await response.text()

      expect(html).toContain("<!doctype html>")
      expect(html).toContain("createApiReference")
      expect(html).toContain("/api/exchange-cryptocurrency-chain/add")
    } finally {
      await dispose()
    }
  })
})
