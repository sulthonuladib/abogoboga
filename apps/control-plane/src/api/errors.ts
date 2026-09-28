import {
  ChainCodeExists,
  ChainLinkExists,
  ChainLinkNotFound,
  ChainNotFound,
  CryptocurrencyCoingeckoIdExists,
  CryptocurrencyNotFound,
  CryptocurrencySlugExists,
  ExchangeCoingeckoIdExists,
  ExchangeNotFound,
  ExchangeSlugExists,
  InvalidRequest,
  MarketExists,
  MarketNotFound,
  WorkerConflict,
  WorkerControlFailure,
  WorkerExchangeNotFound
} from "@lister/api/client"
import { Schema } from "effect"
import { HttpClientError } from "effect/unstable/http"

/**
 * Operator-facing messages for API failures.
 *
 * Expected failures are matched by their error class; anything unrecognized
 * falls back to a plain retry message so a defect never leaks internals into
 * the interface.
 *
 * @param error - The failure value from a query or mutation, when it is an `Error`.
 * @returns A sentence the interface can show as-is.
 */
export const describeApiError = (error: Error | undefined): string => {
  if (error instanceof ChainCodeExists) return `Chain code "${error.code}" already exists.`

  if (error instanceof ExchangeSlugExists) return `Slug "${error.slug}" is already used by another exchange.`

  if (error instanceof ExchangeCoingeckoIdExists) {
    return `CoinGecko id "${error.coingeckoId}" is already used by another exchange.`
  }

  if (error instanceof CryptocurrencySlugExists) return `Slug "${error.slug}" is already used by another coin.`

  if (error instanceof CryptocurrencyCoingeckoIdExists) {
    return `CoinGecko id "${error.coingeckoId}" is already used by another coin.`
  }

  if (error instanceof MarketExists) return "That coin is already assigned to the exchange."

  if (error instanceof ChainLinkExists) return "That chain is already linked to the market."

  if (error instanceof ChainNotFound) return "That chain no longer exists. Refresh and try again."

  if (error instanceof ExchangeNotFound) return "That exchange no longer exists. Refresh and try again."

  if (error instanceof CryptocurrencyNotFound) return "That coin no longer exists. Refresh and try again."

  if (error instanceof MarketNotFound) return "That market assignment no longer exists. Refresh and try again."

  if (error instanceof ChainLinkNotFound) return "That chain link no longer exists. Refresh and try again."

  if (error instanceof WorkerConflict) return error.message

  if (error instanceof WorkerExchangeNotFound) return "That exchange no longer exists. Refresh and try again."

  if (error instanceof WorkerControlFailure) return `The worker supervisor rejected the request: ${error.message}`

  if (error instanceof InvalidRequest) return `The API rejected the request: ${error.message}`

  if (error instanceof HttpClientError.HttpClientError) return "Could not reach the API. Check the server and try again."

  if (Schema.isSchemaError(error)) return "The API returned an unexpected response. Reload the page."

  return "Something went wrong. Try again."
}
