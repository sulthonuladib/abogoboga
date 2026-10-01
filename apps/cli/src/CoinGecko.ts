/**
 * CoinGecko exchange-metadata adapter.
 *
 * Owns the exchange target list and the translation between CoinGecko's REST
 * responses and the application's own shapes. The vendor SDK and its raw
 * response types stay inside this module; callers depend on {@link CoinGecko}
 * and the parsed {@link CoinListItem}/{@link ExchangeTicker} values.
 *
 * @module
 */

import Coingecko from "@coingecko/coingecko-typescript"
import { Config, Context, Duration, Effect, Layer, Option, Redacted, Schema } from "effect"

/**
 * Quote currency an exchange's books are denominated in.
 */
export type BaseCurrency = "usdt" | "idr"

/**
 * One exchange targeted by the metadata scanner.
 *
 * `slug` is the operator-facing identity persisted in the `exchange` table;
 * `coingeckoId` is the vendor's exchange id, which differs for some venues
 * (`gateio` → `gate`, `htx` → `huobi`, `mexc` → `mxc`).
 */
export type TargetExchange = {
  /** Stable exchange slug used in the database and worker argv. */
  readonly slug: string
  /** Human-readable exchange name. */
  readonly name: string
  /** CoinGecko exchange id used by the API. */
  readonly coingeckoId: string
  /** Query used to resolve the exchange's large logo through `/search`. */
  readonly searchQuery: string
  /** Quote currency the exchange's books are denominated in. */
  readonly baseCurrency: BaseCurrency
}

/**
 * Exchanges the metadata scanner reads from CoinGecko.
 */
export const targetExchanges: ReadonlyArray<TargetExchange> = [
  { slug: "binance", name: "Binance", coingeckoId: "binance", searchQuery: "Binance", baseCurrency: "usdt" },
  { slug: "indodax", name: "Indodax", coingeckoId: "indodax", searchQuery: "Indodax", baseCurrency: "idr" },
  { slug: "kucoin", name: "KuCoin", coingeckoId: "kucoin", searchQuery: "KuCoin", baseCurrency: "usdt" },
  { slug: "gateio", name: "Gate.io", coingeckoId: "gate", searchQuery: "Gate", baseCurrency: "usdt" },
  { slug: "mexc", name: "MEXC", coingeckoId: "mxc", searchQuery: "MEXC", baseCurrency: "usdt" },
  { slug: "bybit", name: "Bybit", coingeckoId: "bybit_spot", searchQuery: "Bybit", baseCurrency: "usdt" },
  { slug: "htx", name: "HTX (Huobi)", coingeckoId: "huobi", searchQuery: "HTX", baseCurrency: "usdt" }
]

/**
 * Look up a target exchange by its operator-facing slug.
 *
 * @param slug - Exchange slug to resolve.
 * @returns The target, or `undefined` when the slug is not targeted.
 */
export const targetExchangeBySlug = (slug: string): TargetExchange | undefined =>
  targetExchanges.find((exchange) => exchange.slug === slug)

const boundedString = Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)))

/**
 * One coin row from `/coins/list`.
 *
 * `name` and `symbol` are relaxed to possibly-empty strings because CoinGecko
 * occasionally lists placeholder coins without them; {@link fetchSnapshot}
 * filters those out before they reach the database.
 */
export const CoinListItem = Schema.Struct({
  id: boundedString,
  name: Schema.String.pipe(Schema.check(Schema.isMaxLength(255))),
  symbol: Schema.String.pipe(Schema.check(Schema.isMaxLength(255))),
  platforms: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Schema.String)))
})

/**
 * One coin row from `/coins/list`.
 */
export type CoinListItem = typeof CoinListItem.Type

/**
 * One exchange ticker, normalized to the four fields the scanner consumes.
 *
 * `targetCoinId` is empty when CoinGecko does not identify the target coin
 * (for example a fiat quote), while `coinId` is always present.
 */
export const ExchangeTicker = Schema.Struct({
  base: boundedString,
  target: boundedString,
  coinId: boundedString,
  targetCoinId: Schema.String.pipe(Schema.check(Schema.isMaxLength(255)))
})

/**
 * One exchange ticker, normalized to the four fields the scanner consumes.
 */
export type ExchangeTicker = typeof ExchangeTicker.Type

/**
 * One page of an exchange's tickers.
 *
 * `pageSize` is the raw number of tickers CoinGecko returned before unusable
 * rows are dropped, so callers can paginate on the vendor's page boundary
 * rather than on the filtered count.
 */
export const ExchangeTickerPage = Schema.Struct({
  name: Schema.String,
  tickers: Schema.Array(ExchangeTicker),
  pageSize: Schema.Int
})

/**
 * One page of an exchange's tickers.
 */
export type ExchangeTickerPage = typeof ExchangeTickerPage.Type

const rawTicker = Schema.Struct({
  base: Schema.String,
  target: Schema.String,
  coin_id: Schema.optional(Schema.NullOr(Schema.String)),
  target_coin_id: Schema.optional(Schema.NullOr(Schema.String))
})

const rawTickerPage = Schema.Struct({
  name: Schema.String,
  tickers: Schema.Array(rawTicker)
})

/**
 * Maximum coin ids sent to one `/coins/markets` logo batch.
 *
 * The `per_page` parameter accepts up to 250, but filtering by `ids` is capped
 * far lower: CoinGecko's CDN blocks a request carrying too many ids with a 403
 * "Request blocked" (an HTML edge response, not the API's JSON error). Batches
 * therefore stay at the documented limit for id lookups (50), not the
 * pagination limit.
 */
export const coinImageBatchSize = 50 as const

const rawExchangeImage = Schema.Struct({ image: Schema.String })

const rawCoinImage = Schema.Struct({ id: Schema.String, image: Schema.String })

const rawSearchExchange = Schema.Struct({ id: Schema.String, large: Schema.String })

const rawSearch = Schema.Struct({ exchanges: Schema.Array(rawSearchExchange) })

/**
 * Upgrade a CoinGecko asset URL to its large variant.
 *
 * CoinGecko serves the same asset at `/thumb/`, `/small/`, and `/large/`;
 * some bulk endpoints (notably `/exchanges/{id}`) only return the small form.
 *
 * @param url - Vendor asset URL.
 * @returns The large variant when a size segment is present.
 */
const preferLarge = (url: string): string => url.replaceAll("/thumb/", "/large/").replaceAll("/small/", "/large/")

/**
 * Expected failure while talking to CoinGecko or parsing its response.
 *
 * `retryable` is true for transient failures (connection errors, 429 rate
 * limits, and 5xx responses) and false for response-shape problems, so the
 * retry policy never retries a decode failure forever.
 */
export class CoinGeckoError extends Schema.TaggedError<CoinGeckoError>()("CoinGeckoError", {
  operation: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(64))),
  detail: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(2048))),
  status: Schema.optional(Schema.Int),
  retryable: Schema.Boolean,
  cause: Schema.Defect()
}) {}

const responseError = (operation: string, cause: unknown): CoinGeckoError =>
  new CoinGeckoError({
    operation,
    detail: "CoinGecko returned an unexpected response shape",
    retryable: false,
    cause
  })

/**
 * Whether an HTTP status is worth retrying: rate limits, server errors, and
 * connection failures with no status.
 *
 * @param status - HTTP status from the SDK, or `undefined` for network errors.
 * @returns Whether the request should be retried.
 */
const retryableStatus = (status: number | undefined): boolean =>
  status === undefined || status === 0 || status === 429 || status >= 500

const requestError = (operation: string, cause: unknown): CoinGeckoError => {
  const status = cause instanceof Coingecko.APIError ? cause.status : undefined

  return new CoinGeckoError({
    operation,
    detail: cause instanceof Error ? cause.message : "CoinGecko request failed",
    status,
    retryable: retryableStatus(status),
    cause
  })
}

/**
 * Backoff for transient CoinGecko failures: exponential from 2s with a 60s
 * cap, at most five retries. A `Retry-After` header (sent with 429s) overrides
 * the computed backoff so the scanner waits exactly as long as CoinGecko asks.
 */
const baseRetryDelayMillis = 2_000

const maxRetryDelayMillis = 60_000

const maxRetries = 5

/**
 * Rate limits are the expected cost of the keyless public pool (~10-30 calls
 * per minute, shared and dynamic), so a 429 is retried far more patiently than
 * a transient server error: wait for the window CoinGecko asks for and keep
 * going instead of failing the whole scan. This cap only bounds a run against a
 * limit that never clears.
 */
const maxRateLimitRetries = 60

/**
 * Wait used for a 429 that carries no usable `Retry-After` header.
 */
const defaultRateLimitDelayMillis = 60_000

/**
 * Read the `Retry-After` delay CoinGecko sends with rate-limit responses.
 *
 * @param error - Request failure, possibly wrapping an SDK `APIError`.
 * @returns Delay in milliseconds, or `undefined` when the header is absent.
 */
const retryAfterMillis = (error: CoinGeckoError): number | undefined => {
  const cause = error.cause

  if (!(cause instanceof Coingecko.APIError)) return undefined

  const header = cause.headers?.get("retry-after")

  if (header === null || header === undefined || header === "") return undefined

  const seconds = Number(header)

  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : undefined
}

/**
 * How long a rate-limited request should wait: the `Retry-After` window
 * CoinGecko sent, or {@link defaultRateLimitDelayMillis} when the header is
 * absent. Exported so a caller that batches requests can wait the same window
 * before splitting the batch into smaller requests.
 *
 * @param error - Rate-limit failure, possibly wrapping an SDK `APIError`.
 * @returns Delay in milliseconds.
 */
export const rateLimitDelayMillis = (error: CoinGeckoError): number =>
  retryAfterMillis(error) ?? defaultRateLimitDelayMillis

/**
 * Retry transient CoinGecko failures, logging each attempt.
 *
 * A 429 (rate limit) is treated differently from other transient failures: it
 * is retried up to {@link maxRateLimitRetries} times (or `options.rateLimitRetries`
 * when given), waiting the `Retry-After` window CoinGecko sends so a keyless,
 * rate-limited scan keeps making progress instead of aborting. Server errors and
 * connection failures keep the smaller {@link maxRetries} budget with
 * exponential backoff.
 *
 * Pass `rateLimitRetries: 0` when the caller intends to shrink the request
 * instead of retrying it unchanged: the 429 then surfaces immediately so the
 * caller can split the batch.
 *
 * @param effect - Request effect to retry.
 * @param options - Optional retry overrides.
 * @returns The request with the retry policy applied.
 */
const withRetry = <A>(
  effect: Effect.Effect<A, CoinGeckoError>,
  options: { readonly rateLimitRetries?: number } = {}
): Effect.Effect<A, CoinGeckoError> => {
  const rateLimitBudget = options.rateLimitRetries ?? maxRateLimitRetries

  const attempt = (remaining: number, rateLimitRetries: number): Effect.Effect<A, CoinGeckoError> =>
    effect.pipe(
      Effect.catch((error: CoinGeckoError) => {
        if (!error.retryable) return Effect.fail(error)

        if (error.status === 429) {
          if (rateLimitRetries >= rateLimitBudget) return Effect.fail(error)

          const delayMillis = rateLimitDelayMillis(error)
          const next = rateLimitRetries + 1

          return Effect.gen(function*() {
            yield* Effect.logWarning(
              `CoinGecko ${error.operation} rate limited (HTTP 429); waiting ${
                Math.round(delayMillis / 1_000)
              }s then retrying (rate-limit retry ${next}/${rateLimitBudget})`
            )
            yield* Effect.sleep(Duration.millis(delayMillis))

            return yield* attempt(remaining, next)
          })
        }

        if (remaining <= 0) return Effect.fail(error)

        const backoffMillis = Math.min(baseRetryDelayMillis * 2 ** (maxRetries - remaining), maxRetryDelayMillis)
        const delayMillis = retryAfterMillis(error) ?? backoffMillis
        const status = error.status === undefined ? "" : ` (HTTP ${error.status})`
        const attemptNumber = maxRetries - remaining + 1

        return Effect.gen(function*() {
          yield* Effect.logWarning(
            `CoinGecko ${error.operation} failed${status}; retrying in ${
              Math.round(delayMillis / 1_000)
            }s (attempt ${attemptNumber}/${maxRetries})`
          )
          yield* Effect.sleep(Duration.millis(delayMillis))

          return yield* attempt(remaining - 1, rateLimitRetries)
        })
      })
    )

  return attempt(maxRetries, 0)
}

/**
 * Options for {@link makeCoinGeckoLayer}.
 */
export interface CoinGeckoLayerOptions {
  /** Override the SDK fetch, used by tests to avoid the network. */
  readonly fetch?: ((input: string | URL | Request, init?: RequestInit) => Promise<Response>) | undefined
}

/**
 * Build the live CoinGecko layer.
 *
 * Uses the Demo API when `COINGECKO_DEMO_API_KEY` is set, and the keyless
 * public endpoint otherwise, so local and CI runs need no secret. `fetch` is
 * injectable so rate-limit retry behavior can be exercised without the network.
 *
 * @param options - Optional fetch override.
 * @returns A layer providing {@link CoinGecko}.
 */
export const makeCoinGeckoLayer = (
  options: CoinGeckoLayerOptions = {}
): Layer.Layer<CoinGecko, Config.ConfigError, never> =>
  Layer.effect(
    CoinGecko,
    Effect.gen(function*() {
      const demoKey = yield* Config.option(Config.Redacted("COINGECKO_DEMO_API_KEY"))

      const client = Option.isSome(demoKey)
        ? new Coingecko({
            environment: "demo",
            demoAPIKey: Redacted.value(demoKey.value),
            maxRetries: 0,
            fetch: options.fetch
          })
        : new Coingecko({
            baseURL: "https://api.coingecko.com/api/v3",
            defaultHeaders: { "x-cg-demo-api-key": null },
            maxRetries: 0,
            fetch: options.fetch
          })

      yield* Effect.logInfo(
        Option.isSome(demoKey)
          ? "CoinGecko: using the keyed Demo API (~100 calls/min)"
          : "CoinGecko: using the keyless public API (~10-30 calls/min, shared IP pool); set COINGECKO_DEMO_API_KEY for a keyed ~100 calls/min"
      )

      const listCoins = Effect.gen(function*() {
        yield* Effect.logInfo("CoinGecko: getting coin list (/coins/list)")

        const raw = yield* withRetry(
          Effect.tryPromise({
            try: () => client.coins.list.get({ include_platform: true }),
            catch: (cause) => requestError("listCoins", cause)
          })
        )

        return yield* Schema.decodeEffect(Schema.Array(CoinListItem))(raw).pipe(
          Effect.mapError((cause) => responseError("listCoins", cause))
        )
      })

      const exchangeTickers = Effect.fn("CoinGecko.exchangeTickers")(function*(coingeckoId: string, page: number) {
        yield* Effect.logInfo(`CoinGecko: getting tickers for ${coingeckoId} (page ${page})`)

        const raw = yield* withRetry(
          Effect.tryPromise({
            try: () => client.exchanges.tickers.get(coingeckoId, { page, order: "base_target" }),
            catch: (cause) => requestError("exchangeTickers", cause)
          })
        )

        const parsed = yield* Schema.decodeEffect(rawTickerPage)(raw).pipe(
          Effect.mapError((cause) => responseError("exchangeTickers", cause))
        )

        const tickers: Array<ExchangeTicker> = []

        for (const ticker of parsed.tickers) {
          const coinId = ticker.coin_id

          if (coinId === undefined || coinId === null || coinId === "") continue

          tickers.push({
            base: ticker.base,
            target: ticker.target,
            coinId,
            targetCoinId: ticker.target_coin_id ?? ""
          })
        }

        return { name: parsed.name, tickers, pageSize: parsed.tickers.length }
      })

      const exchangeLogo = Effect.fn("CoinGecko.exchangeLogo")(function*(coingeckoId: string, searchQuery: string) {
        yield* Effect.logInfo(`CoinGecko: getting logo for ${coingeckoId} via search "${searchQuery}"`)

        const searchRaw = yield* withRetry(
          Effect.tryPromise({
            try: () => client.search.get({ query: searchQuery }),
            catch: (cause) => requestError("exchangeLogo", cause)
          })
        )

        const search = yield* Schema.decodeEffect(rawSearch)(searchRaw).pipe(
          Effect.mapError((cause) => responseError("exchangeLogo", cause))
        )

        const match = search.exchanges.find((exchange) => exchange.id === coingeckoId)

        if (match !== undefined) return preferLarge(match.large)

        // Fallback when search does not surface the venue: the canonical
        // exchange endpoint always has it, but only at the small size.
        yield* Effect.logInfo(`CoinGecko: logo for ${coingeckoId} missing from search; getting /exchanges/${coingeckoId}`)

        const imageRaw = yield* withRetry(
          Effect.tryPromise({
            try: () => client.exchanges.getID(coingeckoId),
            catch: (cause) => requestError("exchangeLogo", cause)
          })
        )

        const image = yield* Schema.decodeEffect(rawExchangeImage)(imageRaw).pipe(
          Effect.mapError((cause) => responseError("exchangeLogo", cause))
        )

        return preferLarge(image.image)
      })

      const coinImages = Effect.fn("CoinGecko.coinImages")(function*(ids: ReadonlyArray<string>) {
        if (ids.length === 0) return new Map<string, string>()

        yield* Effect.logInfo(`CoinGecko: getting logos for ${ids.length} coin(s) (/coins/markets)`)

        // A rate-limited batch is not retried at this size: it surfaces so the
        // scanner can wait out the window and split it into smaller requests.
        const raw = yield* withRetry(
          Effect.tryPromise({
            try: () =>
              client.coins.markets.get({
                vs_currency: "usd",
                ids: ids.join(","),
                per_page: coinImageBatchSize,
                page: 1
              }),
            catch: (cause) => requestError("coinImages", cause)
          }),
          { rateLimitRetries: 0 }
        )

        const parsed = yield* Schema.decodeEffect(Schema.Array(rawCoinImage))(raw).pipe(
          Effect.mapError((cause) => responseError("coinImages", cause))
        )

        return new Map(parsed.map((item) => [item.id, preferLarge(item.image)]))
      })

      return CoinGecko.of({ listCoins, exchangeTickers, exchangeLogo, coinImages })
    })
  )

/**
 * CoinGecko access used by the metadata scanner.
 *
 * Requests are paced at the call site. Transient failures are retried with
 * backoff; a 429 rate limit is waited out (`Retry-After`) and retried
 * patiently, since the keyless public pool rate-limits routinely.
 */
export class CoinGecko extends Context.Service<
  CoinGecko,
  {
    /** Every active coin CoinGecko knows about, with its platform contracts. */
    readonly listCoins: Effect.Effect<ReadonlyArray<CoinListItem>, CoinGeckoError>
    /** One page (100 tickers) of an exchange's tickers in `base_target` order. */
    readonly exchangeTickers: (
      coingeckoId: string,
      page: number
    ) => Effect.Effect<ExchangeTickerPage, CoinGeckoError>
    /** Large logo URL for one exchange, resolved through search. */
    readonly exchangeLogo: (
      coingeckoId: string,
      searchQuery: string
    ) => Effect.Effect<string, CoinGeckoError>
    /**
     * Logo URLs keyed by coin id for one batch of at most
     * {@link coinImageBatchSize} coins.
     *
     * A rate-limited (429) call fails fast rather than retrying at the same
     * size, so the caller can wait out the window and split the batch.
     */
    readonly coinImages: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyMap<string, string>, CoinGeckoError>
  }
>()("lister/cli/CoinGecko") {
  /**
   * Live layer over the official SDK.
   *
   * A getter so {@link makeCoinGeckoLayer} can reference the service tag after
   * the class binding is initialized.
   */
  static get layer(): Layer.Layer<CoinGecko, Config.ConfigError, never> {
    return makeCoinGeckoLayer()
  }

  /**
   * Live layer with an injectable fetch, for tests.
   */
  static get layerWith(): typeof makeCoinGeckoLayer {
    return makeCoinGeckoLayer
  }
}
