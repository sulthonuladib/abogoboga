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
  /** Quote currency the exchange's books are denominated in. */
  readonly baseCurrency: BaseCurrency
}

/**
 * Exchanges the metadata scanner reads from CoinGecko.
 */
export const targetExchanges: ReadonlyArray<TargetExchange> = [
  { slug: "binance", name: "Binance", coingeckoId: "binance", baseCurrency: "usdt" },
  { slug: "indodax", name: "Indodax", coingeckoId: "indodax", baseCurrency: "idr" },
  { slug: "kucoin", name: "KuCoin", coingeckoId: "kucoin", baseCurrency: "usdt" },
  { slug: "gateio", name: "Gate.io", coingeckoId: "gate", baseCurrency: "usdt" },
  { slug: "mexc", name: "MEXC", coingeckoId: "mxc", baseCurrency: "usdt" },
  { slug: "bybit", name: "Bybit", coingeckoId: "bybit_spot", baseCurrency: "usdt" },
  { slug: "htx", name: "HTX (Huobi)", coingeckoId: "huobi", baseCurrency: "usdt" }
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
 * Retry transient CoinGecko failures, honoring `Retry-After` on 429s and
 * logging each attempt.
 *
 * @param effect - Request effect to retry.
 * @returns The request with the retry policy applied.
 */
const withRetry = <A>(effect: Effect.Effect<A, CoinGeckoError>): Effect.Effect<A, CoinGeckoError> => {
  const attempt = (remaining: number): Effect.Effect<A, CoinGeckoError> =>
    effect.pipe(
      Effect.catch((error: CoinGeckoError) => {
        if (!error.retryable || remaining <= 0) return Effect.fail(error)

        const backoffMillis = Math.min(baseRetryDelayMillis * 2 ** (maxRetries - remaining), maxRetryDelayMillis)
        const delayMillis = retryAfterMillis(error) ?? backoffMillis
        const status = error.status === undefined ? "" : ` (HTTP ${error.status})`

        return Effect.gen(function*() {
          yield* Effect.logWarning(
            `CoinGecko ${error.operation} failed${status}; retrying in ${Math.round(delayMillis / 1_000)}s`
          )
          yield* Effect.sleep(Duration.millis(delayMillis))

          return yield* attempt(remaining - 1)
        })
      })
    )

  return attempt(maxRetries)
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

      const listCoins = withRetry(
        Effect.tryPromise({
          try: () => client.coins.list.get({ include_platform: true }),
          catch: (cause) => requestError("listCoins", cause)
        })
      ).pipe(
        Effect.flatMap((raw) =>
          Schema.decodeUnknownEffect(Schema.Array(CoinListItem))(raw).pipe(
            Effect.mapError((cause) => responseError("listCoins", cause))
          )
        )
      )

      const exchangeTickers = Effect.fn("CoinGecko.exchangeTickers")(function*(coingeckoId: string, page: number) {
        const raw = yield* withRetry(
          Effect.tryPromise({
            try: () => client.exchanges.tickers.get(coingeckoId, { page, order: "base_target" }),
            catch: (cause) => requestError("exchangeTickers", cause)
          })
        )

        const parsed = yield* Schema.decodeUnknownEffect(rawTickerPage)(raw).pipe(
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

      return CoinGecko.of({ listCoins, exchangeTickers })
    })
  )

/**
 * CoinGecko access used by the metadata scanner.
 *
 * Requests are paced at the call site and retried with backoff (honoring
 * `Retry-After`) for transient failures such as 429 rate limits.
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
