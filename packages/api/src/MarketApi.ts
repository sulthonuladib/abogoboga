import { CryptocurrencyId, ExchangeId, Market as MarketModel, MarketId } from "@lister/domain"
import { Effect, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { CryptocurrencyNotFound } from "./CryptocurrencyErrors.ts"
import { ExchangeNotFound } from "./ExchangeErrors.ts"
import { MarketExists, MarketNotFound } from "./MarketErrors.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * Filter payload of `POST /api/exchange-cryptocurrency/list` and
 * `POST /api/exchange-cryptocurrency/count`.
 */
export const MarketListPayload = Schema.Struct({
  exchangeId: Schema.optional(ExchangeId),
  cryptocurrencyId: Schema.optional(CryptocurrencyId)
})

/**
 * Payload of `POST /api/exchange-cryptocurrency/assign`.
 *
 * `listed` and `tradeEnabled` keep the database defaults application-side so
 * clients may omit them, matching the legacy insert surface.
 */
export const MarketCreatePayload = Schema.Struct({
  ...MarketModel.jsonCreate.fields,
  listed: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  tradeEnabled: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
})

/**
 * Response of `POST /api/exchange-cryptocurrency/list`.
 */
export const MarketListResponse = Schema.Array(MarketModel.json)

/**
 * OpenAPI annotations helper for one endpoint.
 *
 * @param identifier - Stable operation id shown in the generated document.
 * @param summary - Short human summary.
 * @param description - Longer human description.
 * @returns Annotation context merged onto the endpoint.
 */
const documented = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

/**
 * HTTP API group for market-assignment CRUD.
 *
 * Paths mirror the legacy oRPC surface under `/api`, and each endpoint declares
 * the tagged errors it can return; request-decoding failures become
 * `InvalidRequest` (422) through {@link RequestValidation}.
 */
export class MarketApiGroup extends HttpApiGroup.make("market")
  .add(
    HttpApiEndpoint.post("assign", "/exchange-cryptocurrency/assign", {
      payload: MarketCreatePayload,
      success: MarketModel.json,
      error: [MarketExists, ExchangeNotFound, CryptocurrencyNotFound]
    }).annotateMerge(
      documented(
        "market.assign",
        "Assign exchange market",
        "Assign a coin to an exchange, rejecting a duplicate pair or missing references."
      )
    ),
    HttpApiEndpoint.post("list", "/exchange-cryptocurrency/list", {
      payload: MarketListPayload,
      success: MarketListResponse
    }).annotateMerge(
      documented(
        "market.list",
        "List market assignments",
        "List market assignments, optionally filtered by exchange or coin."
      )
    ),
    HttpApiEndpoint.post("count", "/exchange-cryptocurrency/count", {
      payload: MarketListPayload,
      success: Schema.Int
    }).annotateMerge(
      documented(
        "market.count",
        "Count market assignments",
        "Count market assignments, optionally filtered by exchange or coin."
      )
    ),
    HttpApiEndpoint.get("findById", "/exchange-cryptocurrency/:id", {
      params: { id: MarketId },
      success: MarketModel.json,
      error: MarketNotFound
    }).annotateMerge(
      documented("market.findById", "Get market assignment", "Fetch one market assignment by id.")
    ),
    HttpApiEndpoint.patch("update", "/exchange-cryptocurrency/:id", {
      params: { id: MarketId },
      payload: MarketModel.jsonUpdate,
      success: MarketModel.json,
      error: [MarketNotFound, MarketExists, ExchangeNotFound, CryptocurrencyNotFound]
    }).annotateMerge(
      documented(
        "market.update",
        "Update market assignment",
        "Update an assignment, rejecting a duplicate pair or missing references."
      )
    ),
    HttpApiEndpoint.delete("unassign", "/exchange-cryptocurrency/:id", {
      params: { id: MarketId },
      success: MarketModel.json,
      error: MarketNotFound
    }).annotateMerge(documented("market.unassign", "Unassign exchange market", "Delete a market assignment by id."))
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Market assignment",
      description: "Exchange/coin market-assignment endpoints."
    })
  ) {}
