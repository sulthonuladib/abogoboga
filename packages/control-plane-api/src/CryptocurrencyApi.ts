import {
  ChainId,
  ChainLinkId,
  Cryptocurrency as CryptocurrencyModel,
  CryptocurrencyId,
  ExchangeId,
  MarketId
} from "@lister/domain"
import { Effect, Schema, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import {
  CryptocurrencyOrderField,
  CryptocurrencySearchField,
  type CryptocurrencyOrderField as CryptocurrencyOrderFieldType,
  type CryptocurrencySearchField as CryptocurrencySearchFieldType,
  type CryptocurrencyStatsFlag,
  type CryptocurrencyStatsSort
} from "./Cryptocurrency.ts"
import {
  CryptocurrencyCoingeckoIdExists,
  CryptocurrencyNotFound,
  CryptocurrencySlugExists
} from "./CryptocurrencyErrors.ts"
import { PaginationQueryFields, paginated } from "./Pagination.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * Query payload of `POST /api/cryptocurrency/list`.
 */
export const CryptocurrencyListPayload = Schema.Struct({
  ...PaginationQueryFields,
  searchBy: CryptocurrencySearchField.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("symbol" satisfies CryptocurrencySearchFieldType))
  ),
  orderBy: CryptocurrencyOrderField.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("coingeckoId" satisfies CryptocurrencyOrderFieldType))
  ),
  exchangeId: Schema.optional(ExchangeId),
  chainId: Schema.optional(ChainId)
})

/**
 * Query payload of `POST /api/cryptocurrency/stats`.
 */
export const CryptocurrencyStatsPayload = Schema.Struct({
  ...PaginationQueryFields,
  flag: Schema.Literals(["all", "blocked", "single"]).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("all" satisfies CryptocurrencyStatsFlag))
  ),
  sortBy: Schema.Literals(["symbol", "markets", "chains", "blocked"]).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("symbol" satisfies CryptocurrencyStatsSort))
  ),
  exchangeId: Schema.optional(ExchangeId),
  chainId: Schema.optional(ChainId)
})

/**
 * Payload of `POST /api/cryptocurrency/metadata`: look a coin up by id or slug.
 */
export const CryptocurrencyMetadataPayload = Schema.Union([
  Schema.Struct({ id: CryptocurrencyId }),
  Schema.Struct({ slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))) })
])

/**
 * Payload of `PATCH /api/cryptocurrency/:id`.
 *
 * Matches the legacy update surface: everything except the managed timestamps
 * and the `logo` field, which is owned by the transfer flow.
 */
export const CryptocurrencyUpdatePayload = Schema.Struct(Struct.omit(CryptocurrencyModel.jsonUpdate.fields, ["logo"]))

/**
 * Chain route shown inside a cryptocurrency's metadata.
 */
export const CryptocurrencyChainListingResponse = Schema.Struct({
  id: ChainId,
  name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  code: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  linkId: ChainLinkId,
  exchangeChainCode: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  exchangeChainName: Schema.NullOr(Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))),
  withdrawEnabled: Schema.Boolean,
  depositEnabled: Schema.Boolean
})

/**
 * Exchange listing shown inside a cryptocurrency's metadata.
 */
export const CryptocurrencyMarketListingResponse = Schema.Struct({
  id: ExchangeId,
  name: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  slug: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  symbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  marketId: MarketId,
  listed: Schema.Boolean,
  tradeEnabled: Schema.Boolean,
  chains: Schema.Array(CryptocurrencyChainListingResponse)
})

/**
 * Response of `POST /api/cryptocurrency/metadata`: the coin plus its listings.
 */
export const CryptocurrencyMetadataResponse = CryptocurrencyModel.json.pipe(
  Schema.fieldsAssign({ exchanges: Schema.Array(CryptocurrencyMarketListingResponse) })
)

/**
 * One row of the listing-stats response.
 */
export const CryptocurrencyStatResponse = CryptocurrencyModel.json.pipe(
  Schema.fieldsAssign({
    markets: Schema.Int,
    chains: Schema.Int,
    blocked: Schema.Int
  })
)

/**
 * Response of `POST /api/cryptocurrency/list`.
 */
export const CryptocurrencyPageResponse = paginated(CryptocurrencyModel.json)

/**
 * Response of `POST /api/cryptocurrency/stats`.
 */
export const CryptocurrencyStatsPageResponse = paginated(CryptocurrencyStatResponse)

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
 * HTTP API group for cryptocurrency CRUD, listing, stats, and metadata.
 *
 * Paths mirror the legacy oRPC surface under `/api`, and each endpoint declares
 * the tagged errors it can return; request-decoding failures become
 * `InvalidRequest` (422) through {@link RequestValidation}.
 */
export class CryptocurrencyApiGroup extends HttpApiGroup.make("cryptocurrency")
  .add(
    HttpApiEndpoint.post("add", "/cryptocurrency/add", {
      payload: CryptocurrencyModel.jsonCreate,
      success: CryptocurrencyModel.json,
      error: [CryptocurrencyCoingeckoIdExists, CryptocurrencySlugExists]
    }).annotateMerge(
      documented("cryptocurrency.add", "Add cryptocurrency", "Create a cryptocurrency, rejecting duplicate coingeckoId or slug.")
    ),
    HttpApiEndpoint.post("list", "/cryptocurrency/list", {
      payload: CryptocurrencyListPayload,
      success: CryptocurrencyPageResponse
    }).annotateMerge(
      documented(
        "cryptocurrency.list",
        "List cryptocurrencies",
        "List cryptocurrencies with search, sort, pagination, exchange, and chain filters."
      )
    ),
    HttpApiEndpoint.post("stats", "/cryptocurrency/stats", {
      payload: CryptocurrencyStatsPayload,
      success: CryptocurrencyStatsPageResponse
    }).annotateMerge(
      documented(
        "cryptocurrency.stats",
        "Cryptocurrency listing stats",
        "List coins with market, chain, and blocked-route coverage counts."
      )
    ),
    HttpApiEndpoint.post("metadata", "/cryptocurrency/metadata", {
      payload: CryptocurrencyMetadataPayload,
      success: CryptocurrencyMetadataResponse,
      error: CryptocurrencyNotFound
    }).annotateMerge(
      documented(
        "cryptocurrency.metadata",
        "Cryptocurrency metadata",
        "Fetch a cryptocurrency with every exchange and chain route that lists it."
      )
    ),
    HttpApiEndpoint.get("findById", "/cryptocurrency/:id", {
      params: { id: CryptocurrencyId },
      success: CryptocurrencyModel.json,
      error: CryptocurrencyNotFound
    }).annotateMerge(
      documented("cryptocurrency.findById", "Get cryptocurrency", "Fetch one cryptocurrency by id.")
    ),
    HttpApiEndpoint.patch("update", "/cryptocurrency/:id", {
      params: { id: CryptocurrencyId },
      payload: CryptocurrencyUpdatePayload,
      success: CryptocurrencyModel.json,
      error: [CryptocurrencyCoingeckoIdExists, CryptocurrencySlugExists, CryptocurrencyNotFound]
    }).annotateMerge(
      documented(
        "cryptocurrency.update",
        "Update cryptocurrency",
        "Update a cryptocurrency, rejecting duplicate coingeckoId or slug."
      )
    ),
    HttpApiEndpoint.delete("remove", "/cryptocurrency/:id", {
      params: { id: CryptocurrencyId },
      success: CryptocurrencyModel.json,
      error: CryptocurrencyNotFound
    }).annotateMerge(
      documented("cryptocurrency.remove", "Remove cryptocurrency", "Delete a cryptocurrency by id.")
    )
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Cryptocurrency",
      description: "Cryptocurrency CRUD, listing, stats, and metadata endpoints."
    })
  ) {}
