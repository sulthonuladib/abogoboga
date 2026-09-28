import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import {
  type ChainsQuery,
  type CoinsQuery,
  type ExchangesQuery,
  chainsQueryFromRoute,
  chainsUrl,
  coinsQueryFromRoute,
  coinsUrl,
  defaultChainsQuery,
  defaultCoinsQuery,
  defaultExchangesQuery,
  exchangesQueryFromRoute,
  exchangesUrl,
  urlToAppRoute,
} from './route'

const parse = (path: string) =>
  Option.getOrThrowWith(
    fromString(`http://localhost${path}`),
    () => new Error(`Failed to parse url: ${path}`),
  )

const coinsRoundTrip = (query: CoinsQuery): CoinsQuery => {
  const route = urlToAppRoute(parse(coinsUrl(query)))

  return route._tag === 'Coins' ? coinsQueryFromRoute(route) : defaultCoinsQuery
}

const exchangesRoundTrip = (query: ExchangesQuery): ExchangesQuery => {
  const route = urlToAppRoute(parse(exchangesUrl(query)))

  return route._tag === 'Exchanges' ? exchangesQueryFromRoute(route) : defaultExchangesQuery
}

const chainsRoundTrip = (query: ChainsQuery): ChainsQuery => {
  const route = urlToAppRoute(parse(chainsUrl(query)))

  return route._tag === 'Chains' ? chainsQueryFromRoute(route) : defaultChainsQuery
}

describe('listing URLs', () => {
  test('the default coins query keeps every parameter out of the URL', () => {
    const href = coinsUrl(defaultCoinsQuery)

    expect(href).not.toContain('searchBy')
    expect(href).not.toContain('limit')
    expect(href).not.toContain('flag')
    expect(href).not.toContain('exchangeId')
    expect(href).not.toContain('chainId')
    expect(coinsRoundTrip(defaultCoinsQuery)).toEqual(defaultCoinsQuery)
  })

  test('a fully set coins query round-trips', () => {
    const query: CoinsQuery = {
      search: 'btc',
      searchBy: ['symbol', 'id'],
      flag: 'blocked',
      sort: 'markets',
      order: 'desc',
      limit: 50,
      exchangeId: Option.some(10),
      chainId: Option.some(5),
      page: 3,
    }

    expect(coinsRoundTrip(query)).toEqual(query)
  })

  test('an unknown searched field is dropped rather than reaching the API', () => {
    const route = urlToAppRoute(parse('/coins?searchBy=name,bogus,slug'))

    const query = route._tag === 'Coins' ? coinsQueryFromRoute(route) : defaultCoinsQuery

    expect(query.searchBy).toEqual(['name', 'slug'])
  })

  test('the default exchange and chain queries round-trip', () => {
    expect(exchangesRoundTrip(defaultExchangesQuery)).toEqual(defaultExchangesQuery)
    expect(chainsRoundTrip(defaultChainsQuery)).toEqual(defaultChainsQuery)
  })

  test('a fully set exchange query round-trips', () => {
    const query: ExchangesQuery = {
      search: 'bin',
      searchBy: ['id', 'name'],
      sort: 'createdAt',
      order: 'desc',
      limit: 10,
      page: 2,
    }

    expect(exchangesRoundTrip(query)).toEqual(query)
  })

  test('a fully set chain query round-trips', () => {
    const query: ChainsQuery = {
      search: 'eth',
      searchBy: ['code'],
      sort: 'createdAt',
      order: 'desc',
      limit: 50,
      page: 2,
    }

    expect(chainsRoundTrip(query)).toEqual(query)
  })
})
