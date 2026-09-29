import {
  ChainOrderField,
  ChainSearchField,
  CryptocurrencySearchField,
  ExchangeOrderField,
  ExchangeSearchField,
} from '@lister/api/client'
import { Array, Option, Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, int, literal, slash } from 'foldkit/route'

// DOMAIN

export const Order = Schema.Literals(['asc', 'desc'])
export type Order = typeof Order.Type

export const CoverageFlag = Schema.Literals(['all', 'blocked', 'single'])
export type CoverageFlag = typeof CoverageFlag.Type

export const CoverageSort = Schema.Literals(['symbol', 'markets', 'chains', 'blocked'])
export type CoverageSort = typeof CoverageSort.Type

/**
 * The figures the signal feed can order by, both descending.
 */
export const SignalSort = Schema.Literals(['profitPercent', 'profitVolume'])
export type SignalSort = typeof SignalSort.Type

/**
 * How the signal feed lays its rows out. Cards read the two sides faster; the
 * table trades that for density.
 */
export const SignalView = Schema.Literals(['cards', 'table'])
export type SignalView = typeof SignalView.Type

// FILTERS

/**
 * The page sizes a listing offers. The API accepts any non-negative limit up
 * to 100, so a larger limit in an old bookmark still parses.
 */
export const pageSizeChoices = [10, 20, 50] as const

export const defaultPageSize = 10

export const defaultCoinsSearchBy: ReadonlyArray<CryptocurrencySearchField> = ['symbol', 'name']
export const defaultExchangesSearchBy: ReadonlyArray<ExchangeSearchField> = ['name', 'slug']
export const defaultChainsSearchBy: ReadonlyArray<ChainSearchField> = ['name', 'code']

// QUERY

/**
 * The listing state a URL carries, as a Schema a page can hold in its Model.
 * A page stores one of these, so the Model reads the way the table does and
 * nothing about the encoding leaks into a page.
 */
export const CoinsQuery = Schema.Struct({
  search: Schema.String,
  searchBy: Schema.Array(CryptocurrencySearchField),
  flag: CoverageFlag,
  sort: CoverageSort,
  order: Order,
  limit: Schema.Int,
  exchangeId: Schema.Option(Schema.Int),
  chainId: Schema.Option(Schema.Int),
  page: Schema.Int,
})

export type CoinsQuery = typeof CoinsQuery.Type

export const ExchangesQuery = Schema.Struct({
  search: Schema.String,
  searchBy: Schema.Array(ExchangeSearchField),
  sort: ExchangeOrderField,
  order: Order,
  limit: Schema.Int,
  page: Schema.Int,
})

export type ExchangesQuery = typeof ExchangesQuery.Type

export const ChainsQuery = Schema.Struct({
  search: Schema.String,
  searchBy: Schema.Array(ChainSearchField),
  sort: ChainOrderField,
  order: Order,
  limit: Schema.Int,
  page: Schema.Int,
})

export type ChainsQuery = typeof ChainsQuery.Type

export const SignalsQuery = Schema.Struct({
  view: SignalView,
  sort: SignalSort,
  threshold: Schema.Finite,
  hiddenExchanges: Schema.Array(Schema.Int),
})

export type SignalsQuery = typeof SignalsQuery.Type

export const defaultCoinsQuery: CoinsQuery = {
  search: '',
  searchBy: defaultCoinsSearchBy,
  flag: 'all',
  sort: 'markets',
  order: 'desc',
  limit: defaultPageSize,
  exchangeId: Option.none(),
  chainId: Option.none(),
  page: 1,
}

export const defaultExchangesQuery: ExchangesQuery = {
  search: '',
  searchBy: defaultExchangesSearchBy,
  sort: 'name',
  order: 'asc',
  limit: defaultPageSize,
  page: 1,
}

export const defaultChainsQuery: ChainsQuery = {
  search: '',
  searchBy: defaultChainsSearchBy,
  sort: 'name',
  order: 'asc',
  limit: defaultPageSize,
  page: 1,
}

export const defaultSignalsQuery: SignalsQuery = {
  view: 'cards',
  sort: 'profitPercent',
  threshold: 0,
  hiddenExchanges: [],
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

/**
 * Search fields travel as a comma-joined list. The default leaves the URL as
 * the page's own address, so the common query stays short.
 */
const searchByText = (fields: ReadonlyArray<string>): string => fields.join(',')

const whenSearchBy = (
  fields: ReadonlyArray<string>,
  fallback: ReadonlyArray<string>,
): Option.Option<string> =>
  whenSet(searchByText(fields), searchByText(fields) === searchByText(fallback))

const readPage = (page: Option.Option<number>): number =>
  Option.getOrElse(page, () => firstPage)

const readSearch = (search: Option.Option<string>): string =>
  Option.getOrElse(search, () => '')

const readSearchBy = <A>(
  schema: Schema.Codec<A, string>,
  raw: Option.Option<string>,
  fallback: ReadonlyArray<A>,
): ReadonlyArray<A> => {
  if (Option.isNone(raw)) {
    return fallback
  }

  const parsed = raw.value.split(',').flatMap((token) =>
    Option.match(Schema.decodeUnknownOption(schema)(token.trim()), {
      onNone: () => [],
      onSome: (value) => [value],
    }))

  return parsed.length === 0 ? fallback : parsed
}

/**
 * Hidden exchange ids travel as a comma-joined list. The empty set leaves the
 * URL as the page's own address.
 */
const whenHiddenExchanges = (ids: ReadonlyArray<number>): Option.Option<string> =>
  Array.isReadonlyArrayEmpty(ids) ? Option.none() : Option.some(ids.join(','))

const readHiddenExchanges = (raw: Option.Option<string>): ReadonlyArray<number> =>
  Option.match(raw, {
    onNone: () => [],
    onSome: (text) =>
      pipe(
        text.split(','),
        Array.flatMap((token) =>
          Option.match(Schema.decodeUnknownOption(Schema.FiniteFromString)(token.trim()), {
            onNone: () => [],
            onSome: (value) => (globalThis.Number.isInteger(value) ? [value] : []),
          })),
        Array.dedupe,
      ),
  })

// ROUTE

const CoinsQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  searchBy: Schema.OptionFromOptional(Schema.String),
  flag: Schema.OptionFromOptional(CoverageFlag),
  sort: Schema.OptionFromOptional(CoverageSort),
  order: Schema.OptionFromOptional(Order),
  limit: Schema.OptionFromOptional(Schema.FiniteFromString),
  exchangeId: Schema.OptionFromOptional(Schema.FiniteFromString),
  chainId: Schema.OptionFromOptional(Schema.FiniteFromString),
  page: Schema.OptionFromOptional(Schema.FiniteFromString),
}

const ExchangesQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  searchBy: Schema.OptionFromOptional(Schema.String),
  sort: Schema.OptionFromOptional(ExchangeOrderField),
  order: Schema.OptionFromOptional(Order),
  limit: Schema.OptionFromOptional(Schema.FiniteFromString),
  page: Schema.OptionFromOptional(Schema.FiniteFromString),
}

const ChainsQueryFields = {
  search: Schema.OptionFromOptional(Schema.String),
  searchBy: Schema.OptionFromOptional(Schema.String),
  sort: Schema.OptionFromOptional(ChainOrderField),
  order: Schema.OptionFromOptional(Order),
  limit: Schema.OptionFromOptional(Schema.FiniteFromString),
  page: Schema.OptionFromOptional(Schema.FiniteFromString),
}

const SignalsQueryFields = {
  view: Schema.OptionFromOptional(SignalView),
  sort: Schema.OptionFromOptional(SignalSort),
  threshold: Schema.OptionFromOptional(Schema.FiniteFromString),
  hidden: Schema.OptionFromOptional(Schema.String),
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
  Signals: SignalsQueryFields,
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export type CoinsRoute = typeof AppRoute.Coins.Type
export type ExchangesRoute = typeof AppRoute.Exchanges.Type
export type ChainsRoute = typeof AppRoute.Chains.Type
export type SignalsRoute = typeof AppRoute.Signals.Type
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

export const signalsRouter = pipe(
  literal('signals'),
  Route.query(Schema.Struct(SignalsQueryFields)),
  Route.mapTo(AppRoute.Signals),
)

const routeParser = Route.oneOf(
  coinRoutesRouter,
  coinsRouter,
  exchangeDetailRouter,
  exchangesRouter,
  chainDetailRouter,
  chainsRouter,
  workersRouter,
  signalsRouter,
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
    searchBy: whenSearchBy(query.searchBy, defaultCoinsQuery.searchBy),
    flag: whenSet(query.flag, query.flag === defaultCoinsQuery.flag),
    sort: whenSet(query.sort, query.sort === defaultCoinsQuery.sort),
    order: whenSet(query.order, query.order === defaultCoinsQuery.order),
    limit: whenSet(query.limit, query.limit === defaultCoinsQuery.limit),
    exchangeId: query.exchangeId,
    chainId: query.chainId,
    page: whenSet(query.page, query.page === firstPage),
  })

export const coinRoutesUrl = (coinId: number): string => coinRoutesRouter({ coinId })

export const exchangesUrl = (query: ExchangesQuery): string =>
  exchangesRouter({
    search: whenNonEmpty(query.search),
    searchBy: whenSearchBy(query.searchBy, defaultExchangesQuery.searchBy),
    sort: whenSet(query.sort, query.sort === defaultExchangesQuery.sort),
    order: whenSet(query.order, query.order === defaultExchangesQuery.order),
    limit: whenSet(query.limit, query.limit === defaultExchangesQuery.limit),
    page: whenSet(query.page, query.page === firstPage),
  })

export const exchangeDetailUrl = (exchangeId: number): string =>
  exchangeDetailRouter({ exchangeId })

export const chainsUrl = (query: ChainsQuery): string =>
  chainsRouter({
    search: whenNonEmpty(query.search),
    searchBy: whenSearchBy(query.searchBy, defaultChainsQuery.searchBy),
    sort: whenSet(query.sort, query.sort === defaultChainsQuery.sort),
    order: whenSet(query.order, query.order === defaultChainsQuery.order),
    limit: whenSet(query.limit, query.limit === defaultChainsQuery.limit),
    page: whenSet(query.page, query.page === firstPage),
  })

export const chainDetailUrl = (chainId: number): string => chainDetailRouter({ chainId })

export const signalsUrl = (query: SignalsQuery): string =>
  signalsRouter({
    view: whenSet(query.view, query.view === defaultSignalsQuery.view),
    sort: whenSet(query.sort, query.sort === defaultSignalsQuery.sort),
    threshold: whenSet(query.threshold, query.threshold === defaultSignalsQuery.threshold),
    hidden: whenHiddenExchanges(query.hiddenExchanges),
  })

// READ

export const coinsQueryFromRoute = (route: CoinsRoute): CoinsQuery => ({
  search: readSearch(route.search),
  searchBy: readSearchBy(
    CryptocurrencySearchField,
    route.searchBy,
    defaultCoinsQuery.searchBy,
  ),
  flag: Option.getOrElse(route.flag, () => defaultCoinsQuery.flag),
  sort: Option.getOrElse(route.sort, () => defaultCoinsQuery.sort),
  order: Option.getOrElse(route.order, () => defaultCoinsQuery.order),
  limit: Option.getOrElse(route.limit, () => defaultCoinsQuery.limit),
  exchangeId: route.exchangeId,
  chainId: route.chainId,
  page: readPage(route.page),
})

export const exchangesQueryFromRoute = (route: ExchangesRoute): ExchangesQuery => ({
  search: readSearch(route.search),
  searchBy: readSearchBy(
    ExchangeSearchField,
    route.searchBy,
    defaultExchangesQuery.searchBy,
  ),
  sort: Option.getOrElse(route.sort, () => defaultExchangesQuery.sort),
  order: Option.getOrElse(route.order, () => defaultExchangesQuery.order),
  limit: Option.getOrElse(route.limit, () => defaultExchangesQuery.limit),
  page: readPage(route.page),
})

export const chainsQueryFromRoute = (route: ChainsRoute): ChainsQuery => ({
  search: readSearch(route.search),
  searchBy: readSearchBy(
    ChainSearchField,
    route.searchBy,
    defaultChainsQuery.searchBy,
  ),
  sort: Option.getOrElse(route.sort, () => defaultChainsQuery.sort),
  order: Option.getOrElse(route.order, () => defaultChainsQuery.order),
  limit: Option.getOrElse(route.limit, () => defaultChainsQuery.limit),
  page: readPage(route.page),
})

export const signalsQueryFromRoute = (route: SignalsRoute): SignalsQuery => ({
  view: Option.getOrElse(route.view, () => defaultSignalsQuery.view),
  sort: Option.getOrElse(route.sort, () => defaultSignalsQuery.sort),
  threshold: Option.getOrElse(route.threshold, () => defaultSignalsQuery.threshold),
  hiddenExchanges: readHiddenExchanges(route.hidden),
})
