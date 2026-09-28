import { Schema } from "effect"

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
