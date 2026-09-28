import { ChainOrderField, ExchangeOrderField } from '@lister/api/client'
import { Option, Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, int, literal, slash } from 'foldkit/route'

// DOMAIN

export const Order = Schema.Literals(['asc', 'desc'])
export type Order = typeof Order.Type

export const CoverageFlag = Schema.Literals(['all', 'blocked', 'single'])
export type CoverageFlag = typeof CoverageFlag.Type

export const CoverageSort = Schema.Literals(['symbol', 'markets', 'chains', 'blocked'])
export type CoverageSort = typeof CoverageSort.Type

// QUERY

/**
 * The listing state a URL carries, as a Schema a page can hold in its Model.
 * A page stores one of these, so the Model reads the way the table does and
 * nothing about the encoding leaks into a page.
 */
export const CoinsQuery = Schema.Struct({
  search: Schema.String,
  flag: CoverageFlag,
  sort: CoverageSort,
  order: Order,
  page: Schema.Int,
})

export type CoinsQuery = typeof CoinsQuery.Type

export const ExchangesQuery = Schema.Struct({
  search: Schema.String,
  sort: ExchangeOrderField,
  order: Order,
  page: Schema.Int,
})

export type ExchangesQuery = typeof ExchangesQuery.Type

export const ChainsQuery = Schema.Struct({
  search: Schema.String,
  sort: ChainOrderField,
  order: Order,
  page: Schema.Int,
})

export type ChainsQuery = typeof ChainsQuery.Type

export const defaultCoinsQuery: CoinsQuery = {
  search: '',
  flag: 'all',
  sort: 'symbol',
  order: 'asc',
  page: 1,
}

export const defaultExchangesQuery: ExchangesQuery = {
  search: '',
  sort: 'name',
  order: 'asc',
  page: 1,
}

export const defaultChainsQuery: ChainsQuery = {
  search: '',
  sort: 'name',
  order: 'asc',
  page: 1,
}

const firstPage = 1

/**
 * A value that differs from its default becomes a query parameter. A value that
 * matches its default leaves the URL as the page's own address.
 */
const whenSet = <A>(value: A, isDefault: boolean): Option.Option<A> =>
  isDefault ? Option.none() : Option.some(value)

const whenNonEmpty = (value: string): Option.Option<string> =>
  Option.fromNullishOr(value === '' ? null : value)

const readPage = (page: Option.Option<number>): number =>
  Option.getOrElse(page, () => firstPage)

const readSearch = (search: Option.Option<string>): string =>
  Option.getOrElse(search, () => '')

// ROUTE

const CoinsQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  flag: Schema.OptionFromOptional(CoverageFlag),
  sort: Schema.OptionFromOptional(CoverageSort),
  order: Schema.OptionFromOptional(Order),
  page: Schema.OptionFromOptional(Schema.Int),
}

const ExchangesQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  sort: Schema.OptionFromOptional(ExchangeOrderField),
  order: Schema.OptionFromOptional(Order),
  page: Schema.OptionFromOptional(Schema.Int),
}

const ChainsQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  sort: Schema.OptionFromOptional(ChainOrderField),
  order: Schema.OptionFromOptional(Order),
  page: Schema.OptionFromOptional(Schema.Int),
}

export const AppRoute = defineRouteUnion({
  Dashboard: {},
  Coins: CoinsQueryFields,
  CoinRoutes: { coinId: Schema.Int },
  Exchanges: ExchangesQueryFields,
  ExchangeDetail: { exchangeId: Schema.Int },
  Chains: ChainsQueryFields,
  ChainDetail: { chainId: Schema.Int },
  Workers: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export type CoinsRoute = typeof AppRoute.Coins.Type
export type ExchangesRoute = typeof AppRoute.Exchanges.Type
export type ChainsRoute = typeof AppRoute.Chains.Type
export type CoinRoutesRoute = typeof AppRoute.CoinRoutes.Type
export type ExchangeDetailRoute = typeof AppRoute.ExchangeDetail.Type
export type ChainDetailRoute = typeof AppRoute.ChainDetail.Type

// ROUTER

export const dashboardRouter = pipe(Route.root, Route.mapTo(AppRoute.Dashboard))

export const coinsRouter = pipe(
  literal('coins'),
  Route.query(Schema.Struct(CoinsQueryFields)),
  Route.mapTo(AppRoute.Coins),
)

export const coinRoutesRouter = pipe(
  literal('coins'),
  slash(int('coinId')),
  slash(literal('routes')),
  Route.mapTo(AppRoute.CoinRoutes),
)

export const exchangesRouter = pipe(
  literal('exchanges'),
  Route.query(Schema.Struct(ExchangesQueryFields)),
  Route.mapTo(AppRoute.Exchanges),
)

export const exchangeDetailRouter = pipe(
  literal('exchanges'),
  slash(int('exchangeId')),
  Route.mapTo(AppRoute.ExchangeDetail),
)

export const chainsRouter = pipe(
  literal('chains'),
  Route.query(Schema.Struct(ChainsQueryFields)),
  Route.mapTo(AppRoute.Chains),
)

export const chainDetailRouter = pipe(
  literal('chains'),
  slash(int('chainId')),
  Route.mapTo(AppRoute.ChainDetail),
)

export const workersRouter = pipe(
  literal('workers'),
  Route.mapTo(AppRoute.Workers),
)

const routeParser = Route.oneOf(
  coinRoutesRouter,
  coinsRouter,
  exchangeDetailRouter,
  exchangesRouter,
  chainDetailRouter,
  chainsRouter,
  workersRouter,
  dashboardRouter,
)

export const urlToAppRoute = Route.parseUrlWithFallback(
  routeParser,
  AppRoute.NotFound,
)

// URL

export const coinsUrl = (query: CoinsQuery): string =>
  coinsRouter({
    search: whenNonEmpty(query.search),
    flag: whenSet(query.flag, query.flag === defaultCoinsQuery.flag),
    sort: whenSet(query.sort, query.sort === defaultCoinsQuery.sort),
    order: whenSet(query.order, query.order === defaultCoinsQuery.order),
    page: whenSet(query.page, query.page === firstPage),
  })

export const coinRoutesUrl = (coinId: number): string => coinRoutesRouter({ coinId })

export const exchangesUrl = (query: ExchangesQuery): string =>
  exchangesRouter({
    search: whenNonEmpty(query.search),
    sort: whenSet(query.sort, query.sort === defaultExchangesQuery.sort),
    order: whenSet(query.order, query.order === defaultExchangesQuery.order),
    page: whenSet(query.page, query.page === firstPage),
  })

export const exchangeDetailUrl = (exchangeId: number): string =>
  exchangeDetailRouter({ exchangeId })

export const chainsUrl = (query: ChainsQuery): string =>
  chainsRouter({
    search: whenNonEmpty(query.search),
    sort: whenSet(query.sort, query.sort === defaultChainsQuery.sort),
    order: whenSet(query.order, query.order === defaultChainsQuery.order),
    page: whenSet(query.page, query.page === firstPage),
  })

export const chainDetailUrl = (chainId: number): string => chainDetailRouter({ chainId })

// READ

export const coinsQueryFromRoute = (route: CoinsRoute): CoinsQuery => ({
  search: readSearch(route.search),
  flag: Option.getOrElse(route.flag, () => defaultCoinsQuery.flag),
  sort: Option.getOrElse(route.sort, () => defaultCoinsQuery.sort),
  order: Option.getOrElse(route.order, () => defaultCoinsQuery.order),
  page: readPage(route.page),
})

export const exchangesQueryFromRoute = (route: ExchangesRoute): ExchangesQuery => ({
  search: readSearch(route.search),
  sort: Option.getOrElse(route.sort, () => defaultExchangesQuery.sort),
  order: Option.getOrElse(route.order, () => defaultExchangesQuery.order),
  page: readPage(route.page),
})

export const chainsQueryFromRoute = (route: ChainsRoute): ChainsQuery => ({
  search: readSearch(route.search),
  sort: Option.getOrElse(route.sort, () => defaultChainsQuery.sort),
  order: Option.getOrElse(route.order, () => defaultChainsQuery.order),
  page: readPage(route.page),
})
