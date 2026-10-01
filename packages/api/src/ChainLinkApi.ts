import { ChainId, ChainLink as ChainLinkModel, ChainLinkId, MarketId } from "@lister/domain"
import { Effect, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ChainNotFound } from "./ChainErrors.ts"
import { ChainLinkExists, ChainLinkNotFound } from "./ChainLinkErrors.ts"
import { MarketNotFound } from "./MarketErrors.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * Filter payload of `POST /api/exchange-cryptocurrency-chain/list`.
 */
export const ChainLinkListPayload = Schema.Struct({
  exchangeCryptocurrencyId: Schema.optional(MarketId),
  chainId: Schema.optional(ChainId)
})

/**
 * Payload of `POST /api/exchange-cryptocurrency-chain/add`.
 *
 * `withdrawEnabled` and `depositEnabled` keep the database defaults
 * application-side so clients may omit them, matching the legacy insert
 * surface.
 */
export const ChainLinkCreatePayload = Schema.Struct({
  ...ChainLinkModel.jsonCreate.fields,
  withdrawEnabled: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  depositEnabled: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
})

/**
 * Response of `POST /api/exchange-cryptocurrency-chain/list`.
 */
export const ChainLinkListResponse = Schema.Array(ChainLinkModel.json)

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
 * HTTP API group for chain-link CRUD.
 *
 * Paths mirror the legacy oRPC surface under `/api`, and each endpoint declares
 * the tagged errors it can return; request-decoding failures become
 * `InvalidRequest` (422) through {@link RequestValidation}.
 */
export class ChainLinkApiGroup extends HttpApiGroup.make("chainLink")
  .add(
    HttpApiEndpoint.post("add", "/exchange-cryptocurrency-chain/add", {
      payload: ChainLinkCreatePayload,
      success: ChainLinkModel.json,
      error: [ChainLinkExists, MarketNotFound, ChainNotFound]
    }).annotateMerge(
      documented(
        "chainLink.add",
        "Add chain link",
        "Link a market assignment to a chain, rejecting a duplicate pair or missing references."
      )
    ),
    HttpApiEndpoint.post("list", "/exchange-cryptocurrency-chain/list", {
      payload: ChainLinkListPayload,
      success: ChainLinkListResponse
    }).annotateMerge(
      documented(
        "chainLink.list",
        "List chain links",
        "List chain links, optionally filtered by market assignment or chain."
      )
    ),
    HttpApiEndpoint.get("findById", "/exchange-cryptocurrency-chain/:id", {
      params: { id: ChainLinkId },
      success: ChainLinkModel.json,
      error: ChainLinkNotFound
    }).annotateMerge(documented("chainLink.findById", "Get chain link", "Fetch one chain link by id.")),
    HttpApiEndpoint.patch("update", "/exchange-cryptocurrency-chain/:id", {
      params: { id: ChainLinkId },
      payload: ChainLinkModel.jsonUpdate,
      success: ChainLinkModel.json,
      error: [ChainLinkNotFound, ChainLinkExists, MarketNotFound, ChainNotFound]
    }).annotateMerge(
      documented(
        "chainLink.update",
        "Update chain link",
        "Update a chain link, rejecting a duplicate pair or missing references."
      )
    ),
    HttpApiEndpoint.delete("remove", "/exchange-cryptocurrency-chain/:id", {
      params: { id: ChainLinkId },
      success: ChainLinkModel.json,
      error: ChainLinkNotFound
    }).annotateMerge(documented("chainLink.remove", "Remove chain link", "Delete a chain link by id."))
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Chain link",
      description: "Market-assignment/chain link endpoints."
    })
  ) {}
