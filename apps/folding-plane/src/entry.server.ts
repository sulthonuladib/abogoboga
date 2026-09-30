import { Effect, Layer, ManagedRuntime, Option } from 'effect'
import { Http } from 'foldkit'
import { Server } from 'foldkit/experimental'
import { fromString } from 'foldkit/url'

import { ObservabilityLive } from '@lister/observability'

import { layerFor, originFromEnv } from './api'
import { Flags, flagsFor } from './flags'
import { init } from './update'
import { view } from './view'

// API

const serverApi = Layer.mergeAll(
  Http.layer,
  layerFor(originFromEnv(process.env)),
)

// RENDER

/**
 * The render runtime.
 *
 * The host calls `renderPage` as a plain fetch handler, outside any Effect
 * fiber, so `Effect.runPromise` would run the render against the default
 * context and nothing the host's own layer installs would reach it. Building
 * the process observability layer into this runtime is what puts the tracer in
 * the render's context, so a page's flag reads are exported as one trace.
 *
 * The service name matches the host's, because in production the two run in one
 * process.
 */
const renderRuntime = ManagedRuntime.make(
  ObservabilityLive({ serviceName: 'folding-plane-host' }),
)

/**
 * Render one request. The Flags are resolved first, so the page a browser
 * hydrates is the page the server read the data for.
 */
export const renderPage = (request: Request): Promise<Server.EntryResult> =>
  renderRuntime.runPromise(
    Effect.gen(function* () {
      if (request.method === 'OPTIONS') {
        return Server.Responded(preflightResponse())
      }

      const url = Option.getOrUndefined(fromString(request.url))

      if (url === undefined) {
        return Server.Responded(new Response('Malformed request URL', { status: 400 }))
      }

      const flags = yield* flagsFor(
        request.headers.get('cookie') ?? '',
        url,
      ).pipe(Effect.provide(serverApi))

      const renderedApplication = yield* Server.renderToString(
        { Flags, routing: {}, init, view },
        { url: request.url, flags, buildId: import.meta.env.FOLDKIT_BUILD_ID },
      )

      return Server.Rendered(renderedApplication, {
        headers: {
          'cache-control': 'private, no-store',
          vary: 'cookie',
          'x-content-type-options': 'nosniff',
        },
      })
    }).pipe(Effect.withSpan('RenderPage')),
  )

// HOST

// NOTE: a preflight reaches this entry in development and in production alike,
// so an application's CORS policy goes here rather than in the host. This
// answer allows nothing and only reports which methods the host forwards.
const preflightResponse = (): Response =>
  new Response(null, {
    status: 204,
    headers: { allow: Server.HOST_METHOD_ANSWERS.allow },
  })
