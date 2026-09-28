import { Effect, Layer } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { describe, expect, test } from 'vitest'

import { countCoins, findExchange } from './query'
import { isApiFailure, layerFor } from './transport'

const pageBody = {
  data: [
    {
      id: 1,
      name: 'Bitcoin',
      symbol: 'BTC',
      slug: 'bitcoin',
      logo: '',
      coingeckoId: 'bitcoin',
      createdAt: '2024-01-02T03:04:05.000Z',
      updatedAt: '2024-01-02T03:04:05.000Z',
      markets: 4,
      chains: 3,
      blocked: 2,
    },
  ],
  meta: {
    items: 1,
    pages: 1,
    page: 1,
    limit: 1,
    from: 1,
    to: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    search: '',
    searchBy: 'symbol',
    order: 'asc',
    orderBy: 'symbol',
  },
}

const provided = (
  body: unknown,
  status = 200,
  onRequest?: (url: string) => void,
) =>
  Layer.mergeAll(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) => {
        onRequest?.(url.toString())
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(body), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
          ),
        )
      }),
    ),
    layerFor('http://test'),
  )

describe('typed API client', () => {
  test('a read decodes through the endpoint derived from Api', async () => {
    let requested = ''

    const page = await Effect.runPromise(
      countCoins().pipe(
        Effect.provide(provided(pageBody, 200, (url) => {
          requested = url
        })),
      ),
    )

    expect(requested.startsWith('http://test/')).toBe(true)
    expect(requested.endsWith('/cryptocurrency/stats')).toBe(true)
    expect(page.data[0]?.symbol).toBe('BTC')
    expect(page.meta.items).toBe(1)
  })

  test('a declared endpoint failure becomes an ApiFailure with the reason', async () => {
    const error = await Effect.runPromise(
      findExchange(999).pipe(
        Effect.provide(
          provided({ _tag: 'ExchangeNotFound', id: 999 }, 404),
        ),
        Effect.flip,
      ),
    )

    expect(isApiFailure(error)).toBe(true)
    if (isApiFailure(error)) {
      expect(error.path).toBe('exchange.findById')
      expect(error.detail).toBe('that exchange no longer exists')
    }
  })

  test('an undeclared failure becomes an ApiFailure rather than crashing', async () => {
    const error = await Effect.runPromise(
      countCoins().pipe(Effect.provide(provided({}, 500)), Effect.flip),
    )

    expect(isApiFailure(error)).toBe(true)
  })
})
