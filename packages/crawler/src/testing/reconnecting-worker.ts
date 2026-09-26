import { BunRuntime, BunWorkerRunner } from "@effect/platform-bun"
import {
  WorkerSourceError,
  runRpcWorker,
  type BootstrapCoin,
  type CanonicalTick,
  type WorkerSourceFactory
} from "@lister/worker-contract"
import { Clock, Effect, Layer, Ref, Stream } from "effect"
import { RpcServer } from "effect/unstable/rpc"

const coinKey = (coin: BootstrapCoin): string => `${coin.symbol}:${coin.coingeckoId}`

const tickFor = (coin: BootstrapCoin, exchangeSlug: string, timestamp: number): CanonicalTick => ({
  exchangeSlug,
  symbol: coin.symbol,
  coingeckoId: coin.coingeckoId,
  bids: [[100, 1]],
  asks: [[101, 1]],
  timestamp
})

// The first source build models a dropped exchange connection; later builds
// emit ticks so tests can observe the worker's reconnect status and recovery.
let builds = 0

const source: WorkerSourceFactory = (initial, context) =>
  Effect.gen(function*() {
    builds += 1

    if (builds === 1) {
      return yield* new WorkerSourceError({ message: "fixture connection dropped" })
    }

    const subscriptions = yield* Ref.make<ReadonlyMap<string, BootstrapCoin>>(
      new Map(initial.map((coin): [string, BootstrapCoin] => [coinKey(coin), coin]))
    )

    const ticks = Stream.tick("50 millis").pipe(
      Stream.mapEffect(() =>
        Effect.gen(function*() {
          const timestamp = yield* Clock.currentTimeMillis
          const coins = yield* Ref.get(subscriptions)

          return [...coins.values()].map((coin) => tickFor(coin, context.exchangeSlug, timestamp))
        })
      ),
      Stream.flatMap(Stream.fromIterable)
    )

    return {
      subscribe: (coins) =>
        Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          for (const coin of coins) next.set(coinKey(coin), coin)

          return next
        }),
      unsubscribe: (coins) =>
        Ref.update(subscriptions, (current) => {
          const next = new Map(current)

          for (const coin of coins) next.delete(coinKey(coin))

          return next
        }),
      ticks,
      close: Effect.void
    }
  })

BunRuntime.runMain(
  runRpcWorker({ exchangeSlug: "reconnecting", source }).pipe(
    Effect.scoped,
    Effect.provide(RpcServer.layerProtocolWorkerRunner.pipe(Layer.provideMerge(BunWorkerRunner.layer)))
  )
)
