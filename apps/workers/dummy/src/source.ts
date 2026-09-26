import { type BootstrapCoin, type CanonicalTick, type WorkerSourceFactory } from "@lister/worker-contract"
import { Clock, Deferred, Effect, Ref, Stream } from "effect"

/**
 * Dummy worker owner hook: the runnable reference implementation of
 * {@link WorkerSourceFactory}.
 *
 * The shared stdio host (`runStdioWorker` in `@lister/worker-contract`) drives
 * this hook exactly like a real exchange:
 *
 * - `initial` carries the bootstrap coins already decoded from argv, and
 *   `context` carries the argv `exchangeSlug`/`shardId`.
 * - `subscribe`/`unsubscribe` arrive as live stdin commands; this source keeps
 *   the subscription set in a `Ref`, so live changes take effect on the next
 *   tick.
 * - every `ticks` value must be a `CanonicalTick`; the host writes each one as
 *   a single JSON line on stdout.
 *
 * This source fabricates an order book around a deterministic base price for
 * every subscribed coin every 50ms and stops emitting when the host closes it.
 * Real exchange apps replace the synthetic tick stream with their websocket
 * logic (foldered from `src/crawl-workers/subprocesses/<exchange>.ts`).
 */

/**
 * Subscription identity for the synthetic source.
 *
 * @param coin - Coin to key.
 */
const keyOf = (coin: BootstrapCoin): string => `${coin.symbol}:${coin.coingeckoId}`

/**
 * Deterministic synthetic base price in the 100–199 range.
 *
 * CoinGecko ids have no numeric value, so derive a stable price from a small
 * string hash.
 *
 * @param coingeckoId - CoinGecko id to hash.
 * @returns A deterministic base price.
 */
const basePrice = (coingeckoId: string): number => {
  let hash = 0

  for (const character of coingeckoId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 10_000
  }

  return 100 + (hash % 100)
}

/**
 * Builds one synthetic book around a deterministic base price.
 *
 * @param coin - Coin the tick belongs to.
 * @param exchangeSlug - Exchange identity from argv.
 * @param millis - Emission time in epoch milliseconds (Clock-driven).
 */
const tickFor = (coin: BootstrapCoin, exchangeSlug: string, millis: number): CanonicalTick => {
  const base = basePrice(coin.coingeckoId)

  return {
    exchangeSlug,
    symbol: coin.symbol,
    coingeckoId: coin.coingeckoId,
    bids: [
      [base, 1],
      [base - 1, 2]
    ],
    asks: [
      [base + 1, 1],
      [base + 2, 2]
    ],
    timestamp: millis
  }
}

/**
 * Synthetic worker source.
 *
 * @param initial - Bootstrap coins decoded from argv.
 * @param context - Worker identity parsed from argv.
 */
export const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    const subscriptions = yield* Ref.make<ReadonlyMap<string, BootstrapCoin>>(
      new Map(initial.map((coin): [string, BootstrapCoin] => [keyOf(coin), coin]))
    )

    const closed = yield* Deferred.make<void>()

    const ticks = Stream.tick("50 millis").pipe(
      Stream.mapEffect(() =>
        Effect.gen(function*() {
          const millis = yield* Clock.currentTimeMillis
          const coins = yield* Ref.get(subscriptions)

          return [...coins.values()].map((coin) => tickFor(coin, context.exchangeSlug, millis))
        })
      ),
      Stream.flatMap((coins) => Stream.fromIterable(coins)),
      Stream.interruptWhen(Deferred.await(closed))
    )

    return {
      subscribe: (coins) =>
        Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          for (const coin of coins) {
            next.set(keyOf(coin), coin)
          }

          return next
        }),
      unsubscribe: (coins) =>
        Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          for (const coin of coins) {
            next.delete(keyOf(coin))
          }

          return next
        }),
      ticks,
      close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)
    }
  })
