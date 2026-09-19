import { describe, expect, test } from "bun:test"
import { Effect, Ref, Stream } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import type { BootstrapCoin } from "./BootstrapCoin.ts"
import type { CanonicalTick } from "./CanonicalTick.ts"
import { WorkerRpc } from "./WorkerRpc.ts"

const tick: CanonicalTick = {
  exchangeSlug: "binance",
  symbol: "BTC",
  cmcId: 1,
  bids: [[67000.5, 0.1]],
  asks: [[67001, 0.15]],
  timestamp: 1726500000000
}

const btc: BootstrapCoin = { symbol: "BTC", cmcId: 1 }

describe("WorkerRpc", () => {
  test("loopback covers Subscribe, Ticks, Health, and Unsubscribe", async () => {
    const program = Effect.gen(function*() {
      const subscribed = yield* Ref.make<ReadonlyArray<BootstrapCoin>>([])

      const handlers = WorkerRpc.toLayer({
        Subscribe: ({ coins }) => Ref.set(subscribed, [...coins]),
        Unsubscribe: ({ coins }) => {
          const removed = new Set(coins.map((coin) => `${coin.symbol}:${coin.cmcId}`))

          return Ref.update(subscribed, (current) =>
            current.filter((coin) => !removed.has(`${coin.symbol}:${coin.cmcId}`)))
        },
        Ticks: () => Stream.make(tick),
        Health: () => Effect.succeed({ running: true })
      })

      const client = yield* RpcTest.makeClient(WorkerRpc).pipe(Effect.provide(handlers))

      const health = yield* client.Health(undefined)

      expect(health).toEqual({ running: true })

      yield* client.Subscribe({ coins: [btc] })

      expect(yield* Ref.get(subscribed)).toEqual([btc])

      const ticks = yield* Stream.runCollect(client.Ticks(undefined))

      expect([...ticks]).toEqual([tick])

      yield* client.Unsubscribe({ coins: [btc] })

      expect(yield* Ref.get(subscribed)).toEqual([])
    })

    await Effect.runPromise(Effect.scoped(program))
  })
})
