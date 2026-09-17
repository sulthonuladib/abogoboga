import { Exchange as ExchangeModel, ExchangeId } from "@lister/domain"
import { Effect, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import {
  ExchangeOrderField,
  type ExchangeOrderField as ExchangeOrderFieldType,
  ExchangeSearchField,
  type ExchangeSearchField as ExchangeSearchFieldType
} from "./Exchange.ts"
import { ExchangeCmcIdExists, ExchangeNotFound, ExchangeSlugExists } from "./ExchangeErrors.ts"
import { PaginationQueryFields, paginated } from "./Pagination.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * Query payload of `POST /api/exchange/list`.
 */
export const ExchangeListPayload = Schema.Struct({
  ...PaginationQueryFields,
  searchBy: ExchangeSearchField.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("name" satisfies ExchangeSearchFieldType))
  ),
  orderBy: ExchangeOrderField.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("id" satisfies ExchangeOrderFieldType))
  )
})

/**
 * Payload of `POST /api/exchange/add`.
 *
 * `registeredOnCmc` keeps the database default application-side so clients may
 * omit it, matching the legacy insert surface.
 */
export const ExchangeCreatePayload = Schema.Struct({
  ...ExchangeModel.jsonCreate.fields,
  registeredOnCmc: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
})

/**
 * Response of `POST /api/exchange/list`.
 */
export const ExchangePageResponse = paginated(ExchangeModel.json)

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
 * HTTP API group for exchange CRUD and listing.
 *
 * Paths mirror the legacy oRPC surface under `/api`, and each endpoint declares
 * the tagged errors it can return; request-decoding failures become
 * `InvalidRequest` (422) through {@link RequestValidation}.
 */
export class ExchangeApiGroup extends HttpApiGroup.make("exchange")
  .add(
    HttpApiEndpoint.post("add", "/exchange/add", {
      payload: ExchangeCreatePayload,
      success: ExchangeModel.json,
      error: [ExchangeCmcIdExists, ExchangeSlugExists]
    }).annotateMerge(
      documented("exchange.add", "Add exchange", "Create an exchange, rejecting duplicate cmcId or slug.")
    ),
    HttpApiEndpoint.post("list", "/exchange/list", {
      payload: ExchangeListPayload,
      success: ExchangePageResponse
    }).annotateMerge(
      documented("exchange.list", "List exchanges", "List exchanges with search, sort, and pagination.")
    ),
    HttpApiEndpoint.get("findById", "/exchange/:id", {
      params: { id: ExchangeId },
      success: ExchangeModel.json,
      error: ExchangeNotFound
    }).annotateMerge(documented("exchange.findById", "Get exchange", "Fetch one exchange by id.")),
    HttpApiEndpoint.patch("update", "/exchange/:id", {
      params: { id: ExchangeId },
      payload: ExchangeModel.jsonUpdate,
      success: ExchangeModel.json,
      error: [ExchangeCmcIdExists, ExchangeSlugExists, ExchangeNotFound]
    }).annotateMerge(
      documented("exchange.update", "Update exchange", "Update an exchange, rejecting duplicate cmcId or slug.")
    ),
    HttpApiEndpoint.delete("remove", "/exchange/:id", {
      params: { id: ExchangeId },
      success: ExchangeModel.json,
      error: ExchangeNotFound
    }).annotateMerge(documented("exchange.remove", "Remove exchange", "Delete an exchange by id."))
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Exchange",
      description: "Exchange CRUD and listing endpoints."
    })
  ) {}
