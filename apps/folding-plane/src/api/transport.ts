import { Context, Effect, Layer, Predicate, Schema } from 'effect'
import { Http } from 'foldkit'
import { HttpClient, HttpClientError } from 'effect/unstable/http'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { Api } from '@lister/api/client'

// ORIGIN

/**
 * The control-plane API this app reads. The server entry resolves it from
 * `API_ORIGIN` and the browser from its own origin, which the host proxies to
 * the same process.
 */
export class ApiOrigin extends Context.Service<ApiOrigin, string>()(
  'lister/folding-plane/ApiOrigin',
) {}

export const browserLayer: Layer.Layer<ApiOrigin> = Layer.sync(
  ApiOrigin,
  () => globalThis.location.origin,
)

export const layerFor = (origin: string): Layer.Layer<ApiOrigin> =>
  Layer.succeed(ApiOrigin, origin)

export const defaultApiOrigin = 'http://localhost:3001'

/**
 * Everything a query needs when the browser runs it: this origin, and an HTTP
 * client that leaves trace headers off so a request stays a simple one.
 */
export const browserApi: Layer.Layer<ApiOrigin | HttpClient.HttpClient> = Layer.mergeAll(
  Http.layer,
  browserLayer,
)

/**
 * Run a query the way the browser does. A Command's effect then requires
 * nothing, which is what lets a page's update stay free of service plumbing.
 */
export const call = <A, E>(
  query: Effect.Effect<A, E, ApiOrigin | HttpClient.HttpClient>,
): Effect.Effect<A, E> => Effect.provide(query, browserApi)

export const originFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): string => {
  const configured = env['API_ORIGIN']

  return configured === undefined || configured === ''
    ? defaultApiOrigin
    : configured
}

// FAILURE

/**
 * Why a request to the control plane produced no decoded response. `detail` is
 * written for the person reading the page, so it names what came back instead
 * of a bare status code.
 */
export class ApiFailure extends Schema.TaggedError<ApiFailure>()('ApiFailure', {
  path: Schema.String,
  detail: Schema.String,
}) {}

export const isApiFailure = (error: unknown): error is ApiFailure =>
  error instanceof ApiFailure

// CLIENT

/**
 * The typed control-plane client. Every method, payload, and response is
 * derived from the `Api` definition, so a path string or payload shape never
 * appears in this app by hand.
 */
export type ApiClient = HttpApiClient.ForApi<typeof Api>

/**
 * Build the typed client against the resolved origin. The transport-owned
 * {@link HttpClient.HttpClient} it runs through is the same one every Command
 * already provides, so a caller sees only the API services a page already
 * required.
 */
export const apiClient: Effect.Effect<
  ApiClient,
  never,
  ApiOrigin | HttpClient.HttpClient
> = Effect.gen(function* () {
  const origin = yield* ApiOrigin

  return yield* HttpApiClient.make(Api, { baseUrl: origin })
})

// ERROR MAPPING

const fixedReasonByTag: Readonly<Record<string, string>> = {
  CryptocurrencySlugExists: 'another coin already uses that slug',
  CryptocurrencyCoingeckoIdExists: 'another coin already uses that CoinGecko id',
  CryptocurrencyNotFound: 'that coin no longer exists',
  ChainCodeExists: 'another chain already uses that code',
  ChainNotFound: 'that chain no longer exists',
  ExchangeSlugExists: 'another exchange already uses that slug',
  ExchangeCoingeckoIdExists: 'another exchange already uses that CoinGecko id',
  ExchangeNotFound: 'that exchange no longer exists',
  MarketNotFound: 'that market no longer exists',
  ChainLinkNotFound: 'that chain link no longer exists',
  WorkerExchangeNotFound: 'that exchange no longer exists',
}

const messageReasonByTag: ReadonlySet<string> = new Set([
  'WorkerConflict',
  'WorkerControlFailure',
  'InvalidRequest',
])

const tagOf = (error: unknown): string | undefined =>
  Predicate.hasProperty(error, '_tag') && typeof error._tag === 'string'
    ? error._tag
    : undefined

const messageOf = (error: unknown): string | undefined =>
  Predicate.hasProperty(error, 'message') && typeof error.message === 'string'
    ? error.message
    : undefined

const taggedReason = (tag: string, error: unknown): string | undefined => {
  const fixed = fixedReasonByTag[tag]

  if (fixed !== undefined) {
    return fixed
  }

  return messageReasonByTag.has(tag) ? messageOf(error) : undefined
}

const describeError = (label: string, error: unknown): ApiFailure => {
  if (Schema.isSchemaError(error)) {
    return new ApiFailure({
      path: label,
      detail: `${label} answered with a shape this app cannot read`,
    })
  }

  if (error instanceof HttpClientError.HttpClientError) {
    return new ApiFailure({
      path: label,
      detail: 'could not reach the API. Check that the control plane is running.',
    })
  }

  const tag = tagOf(error)
  const reason = tag === undefined ? undefined : taggedReason(tag, error)

  return new ApiFailure({
    path: label,
    detail: reason ?? `${label} could not be read`,
  })
}

/**
 * Run one typed endpoint against the control plane.
 *
 * Every way this can go wrong, from an unreachable host to a body that does not
 * match the endpoint schema or a declared failure the server returned, arrives
 * as an {@link ApiFailure}. Callers never handle a transport error or a Schema
 * error of their own.
 *
 * @param label - The endpoint's name, used only to describe a failure.
 * @param callEndpoint - Builds the endpoint request from the typed client.
 * @returns The decoded success value or an {@link ApiFailure}.
 */
export const apiRequest = <A, E>(
  label: string,
  callEndpoint: (client: ApiClient) => Effect.Effect<A, E>,
): Effect.Effect<A, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* apiClient

    return yield* callEndpoint(client).pipe(
      Effect.mapError((error) => describeError(label, error)),
    )
  })
