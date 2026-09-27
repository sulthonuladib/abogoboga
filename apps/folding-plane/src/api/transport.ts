import { Context, Effect, Layer, Option, Schema } from 'effect'
import { Http } from 'foldkit'
import {
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http'

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

// TRANSPORT

const isSuccess = (status: number): boolean => status >= 200 && status < 300

const requestFor = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  origin: string,
  path: string,
  body: Option.Option<unknown>,
) => {
  const request = HttpClientRequest.make(method)(`${origin}${path}`)

  return Option.match(body, {
    onNone: () => HttpClientRequest.acceptJson(request),
    onSome: (payload) =>
      HttpClientRequest.acceptJson(
        HttpClientRequest.setBody(request, HttpBody.jsonUnsafe(payload)),
      ),
  })
}

const isDecodable = (path: string) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    isSuccess(response.status)
      ? Effect.succeed(response)
      : Effect.fail(
        new ApiFailure({ path, detail: `the API answered ${response.status}` }),
      )

const decodeJson = <A, I>(path: string, schema: Schema.Codec<A, I>) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    Effect.gen(function* () {
      const json = yield* response.json.pipe(
        Effect.mapError(
          () =>
            new ApiFailure({
              path,
              detail: `${path} answered with a body this app cannot read`,
            }),
        ),
      )

      return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
        Effect.mapError((error) =>
          new ApiFailure({
            path,
            detail: `${path} answered with a shape this app cannot read: ${error.message}`,
          }),
        ),
      )
    })

/**
 * Send one request to the control plane and decode its body.
 *
 * Every way this can go wrong, from an unreachable host to a body that does not
 * match the response schema, arrives as an {@link ApiFailure}. Callers never
 * handle a transport error or a Schema error of their own.
 */
export const request = <A, I>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: Option.Option<unknown>,
  schema: Schema.Codec<A, I>,
): Effect.Effect<A, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const origin = yield* ApiOrigin
    const response = yield* HttpClient.execute(requestFor(method, origin, path, body)).pipe(
      Effect.catchTag('HttpClientError', () =>
        Effect.fail(
          new ApiFailure({
            path,
            detail: 'could not reach the API. Check that the control plane is running.',
          }),
        ),
      ),
      Effect.flatMap(isDecodable(path)),
    )

    return yield* decodeJson(path, schema)(response)
  })

export const get = <A, I>(path: string, schema: Schema.Codec<A, I>) =>
  request('GET', path, Option.none(), schema)

export const post = <A, I>(path: string, body: unknown, schema: Schema.Codec<A, I>) =>
  request('POST', path, Option.some(body), schema)

export const patch = <A, I>(path: string, body: unknown, schema: Schema.Codec<A, I>) =>
  request('PATCH', path, Option.some(body), schema)

export const del = <A, I>(path: string, schema: Schema.Codec<A, I>) =>
  request('DELETE', path, Option.none(), schema)
