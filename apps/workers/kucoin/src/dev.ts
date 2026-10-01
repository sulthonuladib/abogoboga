import { BunRuntime } from "@effect/platform-bun"
import { type BootstrapCoin } from "@lister/worker-contract"
import { Effect, Stream } from "effect"
import { source } from "./source.ts"

/**
 * Development entrypoint for the Kucoin worker.
 *
 * Runs the exchange source directly in the main thread, with no RPC host,
 * sharding, or supervisor: it subscribes to the coins named on the command
 * line and prints every emitted `CanonicalTick` as one JSON line.
 *
 * Usage:
 *
 * ```sh
 * bun run apps/workers/kucoin/src/dev.ts
 * bun run apps/workers/kucoin/src/dev.ts btc eth
 * bun run apps/workers/kucoin/src/dev.ts btc:bitcoin sol:solana
 * ```
 *
 * Each argument is `symbol` or `symbol:coingeckoId`; the CoinGecko id defaults
 * to the lowercased symbol when omitted.
 */

/**
 * Coin streamed when no argument names one.
 */
const defaultCoin: BootstrapCoin = { symbol: "BTC", coingeckoId: "bitcoin" }

/**
 * Parse one `symbol[:coingeckoId]` argument into a bootstrap coin.
 *
 * @param argument - Raw command-line argument.
 */
const parseCoin = (argument: string): BootstrapCoin => {
  const [rawSymbol = "", rawCoingeckoId = ""] = argument.split(":")
  const symbol = rawSymbol.trim().toUpperCase()

  if (symbol === "") return defaultCoin

  const coingeckoId = rawCoingeckoId.trim().toLowerCase()

  return { symbol, coingeckoId: coingeckoId === "" ? symbol.toLowerCase() : coingeckoId }
}

const requested = Bun.argv.slice(2)

const coins: ReadonlyArray<BootstrapCoin> =
  requested.length === 0 ? [defaultCoin] : requested.map(parseCoin)

BunRuntime.runMain(
  Effect.scoped(
    Effect.gen(function*() {
      const worker = yield* source(coins, { exchangeSlug: "kucoin", shardId: "shard-0" })

      yield* Effect.logInfo(`kucoin dev: streaming ${coins.map((coin) => coin.symbol).join(", ")}`)

      yield* worker.ticks.pipe(
        Stream.runForEach((tick) =>
          Effect.sync(() => {
            console.log(JSON.stringify(tick))
          })
        )
      )
    })
  )
)
