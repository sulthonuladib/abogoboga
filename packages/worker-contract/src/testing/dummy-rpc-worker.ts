/**
 * Test fixture: a runnable RPC worker built on {@link runRpcWorker} with a
 * synthetic in-memory source.
 *
 * Spawned as a Bun worker by `RpcSpike.test.ts` and the crawler supervisor
 * tests. Real exchange apps instead call
 * `BunRuntime.runMain(Layer.launch(runRpcWorker({ exchangeSlug, source }).pipe(Layer.provide(BunWorkerRunner.layer))))`
 * from `@effect/platform-bun`.
 *
 * Not exported from the package entrypoint.
 */
import { BunRuntime, BunWorkerRunner } from "@effect/platform-bun"
import { Clock, Effect, Layer, Ref, Stream } from "effect"
import { RpcServer } from "effect/rpc"

import type { BootstrapCoin } from "../BootstrapCoin.ts"
import type { CanonicalTick } from "../CanonicalTick.ts"
import { runRpcWorker } from "../RpcWorker.ts"
import type { WorkerSourceFactory } from "../WorkerSource.ts"

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
 * @param exchangeSlug - Exchange identity from the bootstrap context.
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
 * `close` completes. Subscriptions follow live subscribe/unsubscribe calls.
 */
const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    const subscriptions = yield* Ref.make<ReadonlyMap<string, BootstrapCoin>>(
      new Map(initial.map((coin): [string, BootstrapCoin] => [keyOf(coin), coin]))
    )

    const ticks = Stream.tick("50 millis").pipe(
      Stream.mapEffect(() =>
        Effect.gen(function*() {
          const millis = yield* Clock.currentTimeMillis
          const coins = yield* Ref.get(subscriptions)

          return [...coins.values()].map((coin) => tickFor(coin, context.exchangeSlug, millis))
        })
      ),
      Stream.flatMap(Stream.fromIterable)
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
      close: Effect.void
    }
  })

BunRuntime.runMain(
  runRpcWorker({ exchangeSlug: "dummy", source }).pipe(
    Effect.scoped,
    Effect.provide(RpcServer.layerProtocolWorkerRunner.pipe(Layer.provideMerge(BunWorkerRunner.layer)))
  )
)
