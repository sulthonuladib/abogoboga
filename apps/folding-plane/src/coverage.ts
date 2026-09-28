import { Effect, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { AsyncData } from 'foldkit'

import { ApiOrigin, Query } from './api'

// COVERAGE

/**
 * The figures the rail shows on every page. One Command reads them all, so the
 * rail and a page never disagree about what the catalogue holds.
 */
export const Coverage = Schema.Struct({
  coins: Schema.Int,
  exchanges: Schema.Int,
  chains: Schema.Int,
  markets: Schema.Int,
  runningWorkers: Schema.Int,
  totalWorkers: Schema.Int,
  reconnectingShards: Schema.Int,
})

export type Coverage = typeof Coverage.Type

export const CoverageData = AsyncData.Schema(Coverage, Schema.String)

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
  const [coins, exchanges, chains, markets, workers] = yield* Effect.all(
    [
      Query.countCoins(),
      Query.countExchanges(),
      Query.countChains(),
      Query.countMarkets(),
      Query.listWorkers(),
    ],
    { concurrency: 'unbounded' },
  )

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
