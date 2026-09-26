/**
 * Test fixture: a runnable worker subprocess built on
 * {@link runStdioWorker} with a synthetic in-memory source.
 *
 * `StdioWorker.test.ts` spawns this file directly. Real exchange apps instead
 * call `BunRuntime.runMain(runStdioWorker(...))` from `@effect/platform-bun`;
 * this fixture uses `Effect.runPromise` to keep the contract package free of
 * the platform runtime.
 *
 * Not exported from the package entrypoint.
 */
import { Clock, Deferred, Effect, Ref, Stream } from "effect"

import type { BootstrapCoin } from "../BootstrapCoin.ts"
import type { CanonicalTick } from "../CanonicalTick.ts"
import { runStdioWorker, type WorkerSourceFactory } from "../StdioWorker.ts"

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
 * Synthetic source: emits a tick for every subscribed coin every 50ms until
 * `close` completes.
 */
const source: WorkerSourceFactory = (initial, context) =>
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

void Effect.runPromise(runStdioWorker({ exchangeSlug: "dummy", source }))
