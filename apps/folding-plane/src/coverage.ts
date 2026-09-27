import { Effect } from 'effect'
import { HttpClient } from 'effect/unstable/http'

import { ApiOrigin, Query } from './api'
import { Coverage } from './model'

/**
 * The figures the rail shows. A one-row page reports the true total, so nothing
 * here counts rows itself.
 *
 * The effect requires the API services rather than providing them: the browser
 * runs it inside a Command against its own origin, and the server runs it before
 * it renders against the configured control plane.
 */
export const readCoverage: Effect.Effect<
  Coverage,
  unknown,
  ApiOrigin | HttpClient.HttpClient
> = Effect.gen(function* () {
  const coins = yield* Query.countCoins()
  const exchanges = yield* Query.countExchanges()
  const chains = yield* Query.countChains()
  const markets = yield* Query.countMarkets()
  const workers = yield* Query.listWorkers()

  return Coverage.make({
    coins: coins.meta.items,
    exchanges: exchanges.meta.items,
    chains: chains.meta.items,
    markets,
    runningWorkers: workers.filter((worker) => worker.running).length,
    totalWorkers: workers.length,
    reconnectingShards: workers.reduce(
      (total, worker) =>
        total +
        worker.shards.filter((shard) => shard.phase === 'reconnecting').length,
      0,
    ),
  })
})
