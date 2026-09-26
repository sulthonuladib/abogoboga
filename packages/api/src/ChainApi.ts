import { Chain as ChainModel, ChainId } from "@lister/domain"
import { Effect, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import {
  ChainOrderField,
  type ChainOrderField as ChainOrderFieldType,
  ChainSearchField,
  type ChainSearchField as ChainSearchFieldType
} from "./Chain.ts"
import { ChainCodeExists, ChainNotFound } from "./ChainErrors.ts"
import { PaginationQueryFields, cursorMatchesSort, onlyOneWindow, paginated } from "./Pagination.ts"
import { RequestValidation } from "./RequestValidation.ts"

/**
 * Query payload of `POST /api/chain/list`.
 *
 * `searchBy` names one or more fields the search text must match. `page` and
 * `cursor` are alternative windows: supplying neither returns the first keyset
 * page and a `nextCursor`, supplying `page` keeps the offset behavior.
 */
export const ChainListPayload = Schema.Struct({
  ...PaginationQueryFields,
  searchBy: Schema.Array(ChainSearchField).pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(8)),
    Schema.withDecodingDefaultTypeKey(Effect.succeed(["name"] satisfies ReadonlyArray<ChainSearchFieldType>))
  ),
  orderBy: ChainOrderField.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("id" satisfies ChainOrderFieldType))
  )
}).check(
  Schema.makeFilter(onlyOneWindow),
  Schema.makeFilter((payload) => cursorMatchesSort(payload.cursor, payload))
)

/**
 * Response of `POST /api/chain/list`.
 */
export const ChainPageResponse = paginated(ChainModel.json)

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
 * HTTP API group for chain CRUD and listing.
 *
 * Paths mirror the legacy oRPC surface under `/api`, and each endpoint declares
 * the tagged errors it can return; request-decoding failures become
 * `InvalidRequest` (422) through {@link RequestValidation}.
 */
export class ChainApiGroup extends HttpApiGroup.make("chain")
  .add(
    HttpApiEndpoint.post("add", "/chain/add", {
      payload: ChainModel.jsonCreate,
      success: ChainModel.json,
      error: ChainCodeExists
    }).annotateMerge(
      documented("chain.add", "Add chain", "Create a chain, rejecting a duplicate code.")
    ),
    HttpApiEndpoint.post("findOrCreate", "/chain/find-or-create", {
      payload: ChainModel.jsonCreate,
      success: ChainModel.json
    }).annotateMerge(
      documented(
        "chain.findOrCreate",
        "Find or create chain",
        "Return the chain with the submitted code, creating it when it does not exist."
      )
    ),
    HttpApiEndpoint.post("list", "/chain/list", {
      payload: ChainListPayload,
      success: ChainPageResponse
    }).annotateMerge(
      documented(
        "chain.list",
        "List chains",
        "List chains with search over one or more fields and either offset pagination (`page`) or keyset pagination (`cursor`, continued with the returned `nextCursor`)."
      )
    ),
    HttpApiEndpoint.get("findById", "/chain/:id", {
      params: { id: ChainId },
      success: ChainModel.json,
      error: ChainNotFound
    }).annotateMerge(documented("chain.findById", "Get chain", "Fetch one chain by id.")),
    HttpApiEndpoint.patch("update", "/chain/:id", {
      params: { id: ChainId },
      payload: ChainModel.jsonUpdate,
      success: ChainModel.json,
      error: [ChainCodeExists, ChainNotFound]
    }).annotateMerge(
      documented("chain.update", "Update chain", "Update a chain, rejecting a duplicate code.")
    ),
    HttpApiEndpoint.delete("remove", "/chain/:id", {
      params: { id: ChainId },
      success: ChainModel.json,
      error: ChainNotFound
    }).annotateMerge(documented("chain.remove", "Remove chain", "Delete a chain by id."))
  )
  .prefix("/api")
  .middleware(RequestValidation)
  .annotateMerge(
    OpenApi.annotations({
      title: "Chain",
      description: "Chain CRUD and listing endpoints."
    })
  ) {}
