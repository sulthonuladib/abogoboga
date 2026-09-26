import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect"

/**
 * A coin subscription identity: trading symbol plus CoinGecko id.
 *
 * `coingeckoId` is a non-empty CoinGecko slug; a numeric-looking id is still a
 * valid string, so no numeric coercion happens.
 */
export const BootstrapCoin = Schema.Struct({
  symbol: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255))),
  coingeckoId: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(255)))
})

/**
 * A coin subscription identity: trading symbol plus CoinGecko id.
 */
export type BootstrapCoin = typeof BootstrapCoin.Type

/**
 * CoinGecko ids are lowercase slugs (`bitcoin`, `usd-coin`, `binance-smart-chain`).
 */
const coingeckoIdPattern = /^[a-z0-9][a-z0-9-]*$/

/**
 * Parse one non-blank `SYMBOL:coingeckoId` part of a bootstrap argument.
 *
 * @param trimmed - The trimmed comma-separated part (never blank).
 * @returns The parsed coin, or `None` when the part is invalid.
 */
const parseCoinPart = (trimmed: string): Option.Option<BootstrapCoin> => {
  const separator = trimmed.lastIndexOf(":")

  if (separator <= 0) {
    return Option.none()
  }

  const symbol = trimmed.slice(0, separator)
  const coingeckoId = trimmed.slice(separator + 1)

  if (symbol === "" || !coingeckoIdPattern.test(coingeckoId)) {
    return Option.none()
  }

  return Schema.decodeUnknownOption(BootstrapCoin)({ symbol, coingeckoId })
}

/**
 * Format coins as a bootstrap argument: `SYMBOL:coingeckoId,...` (empty for none).
 *
 * @param coins - The coins to format.
 * @returns The comma-separated bootstrap string.
 */
export const formatBootstrapCoins = (coins: ReadonlyArray<BootstrapCoin>): string =>
  coins.map((coin) => `${coin.symbol}:${coin.coingeckoId}`).join(",")

/**
 * Codec between the argv bootstrap string (`SYMBOL:coingeckoId,...`, empty means no
 * coins) and coin arrays.
 *
 * Blank parts are skipped; any invalid part fails decoding instead of throwing.
 */
export const BootstrapCoinsFromString = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(8192)),
  Schema.decodeTo(
    Schema.Array(BootstrapCoin),
    SchemaTransformation.transformEffect({
      decode: (value, options) => {
        if (value.trim() === "") {
          return Effect.succeed<ReadonlyArray<BootstrapCoin>>([])
        }

        const coins: Array<BootstrapCoin> = []

        for (const part of value.split(",")) {
          const trimmed = part.trim()

          if (trimmed === "") {
            continue
          }

          const parsed = parseCoinPart(trimmed)

          if (Option.isNone(parsed)) {
            return Effect.fail(
              new SchemaIssue.InvalidValue({ message: `Invalid bootstrap coin: ${trimmed}` }, value, options)
            )
          }

          coins.push(parsed.value)
        }

        return Effect.succeed<ReadonlyArray<BootstrapCoin>>(coins)
      },
      encode: (coins) => Effect.succeed(formatBootstrapCoins(coins))
    })
  )
)

/**
 * Argv marker identifying a worker subprocess invocation.
 */
export const workerArgvMarker = "--crawler-worker" as const

/**
 * Argv positions for worker bootstrap arguments (script-form user args start
 * at index 2).
 */
export const workerArgvIndex = { marker: 2, exchange: 3, shard: 4, coins: 5 } as const
