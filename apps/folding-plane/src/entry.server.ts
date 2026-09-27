import { Effect, Layer, Option } from 'effect'
import { Http } from 'foldkit'
import { Server } from 'foldkit/experimental'
import { fromString } from 'foldkit/url'

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
 * Render one request. The Flags are resolved first, so the page a browser
 * hydrates is the page the server read the data for.
 */
export const renderPage = (request: Request): Promise<Server.EntryResult> =>
  Effect.runPromise(
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
    }),
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
