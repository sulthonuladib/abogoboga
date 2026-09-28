import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/unstable/reactivity"
import { Link } from "react-router"
import { chainListAtom, coinStatsAtom, exchangeListAtom, marketIndexAtom, workersAtom } from "../api/atoms.ts"
import { formatCount } from "../lib/format.ts"
import { BlockedCell, MarketsCell } from "../ui/Coverage.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { EmptyState, ErrorAlert, RetryButton } from "../ui/States.tsx"
import { StatStrip } from "../ui/StatStrip.tsx"
import { Body, DataTable, Head, LoadingRows, Row, Td, Th } from "../ui/Table.tsx"

const attentionRows = 5

const blockedColumns = 4

const thinColumns = 2

/**
 * Format a count that may still be loading.
 *
 * @param count - Total reported by a query, or `undefined` while it loads.
 * @returns The formatted count, or an ellipsis while loading.
 */
const countOrPending = (count: number | undefined): string => (count === undefined ? "…" : formatCount(count))

/**
 * Coins with blocked routes: ordered market pairs that have no transfer route
 * in either direction.
 */
const BlockedRoutes = () => {
  const statsAtom = coinStatsAtom({ limit: attentionRows, flag: "blocked", sortBy: "blocked", order: "desc" })
  const stats = useAtomValue(statsAtom)
  const refresh = useAtomRefresh(statsAtom)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-sm font-medium">Blocked routes</h2>
        <p className="text-xs text-muted-foreground">Ordered market pairs with no route in either direction.</p>
      </div>

      {AsyncResult.isInitial(stats) || AsyncResult.isWaiting(stats) ? (
        <DataTable>
          <Head>
            <Th>Coin</Th>
            <Th align="right">Markets</Th>
            <Th align="right">Chains</Th>
            <Th align="right">Blocked</Th>
          </Head>
          <LoadingRows colSpan={blockedColumns} />
        </DataTable>
      ) : AsyncResult.isFailure(stats) ? (
        <ErrorAlert
          title="Could not load blocked routes"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : stats.value.data.length === 0 ? (
        <EmptyState
          title="No blocked routes"
          description="Every ordered market pair has a transfer route in at least one direction."
        />
      ) : (
        <DataTable>
          <Head>
            <Th>Coin</Th>
            <Th align="right">Markets</Th>
            <Th align="right">Chains</Th>
            <Th align="right">Blocked</Th>
          </Head>
          <Body>
            {stats.value.data.map((coin) => (
              <Row key={coin.id}>
                <Td>
                  <Link
                    to={`/coins/${coin.id}/routes`}
                    className="font-medium uppercase underline-offset-4 hover:underline"
                  >
                    {coin.symbol}
                  </Link>
                </Td>
                <Td align="right">
                  <MarketsCell markets={coin.markets} />
                </Td>
                <Td align="right">{formatCount(coin.chains)}</Td>
                <Td align="right">
                  <BlockedCell blocked={coin.blocked} />
                </Td>
              </Row>
            ))}
          </Body>
        </DataTable>
      )}
    </section>
  )
}

/**
 * Coins listed on a single market: without a second market there is no pair to
 * route value between.
 */
const ThinCoverage = () => {
  const statsAtom = coinStatsAtom({ limit: attentionRows, flag: "single", sortBy: "markets", order: "asc" })
  const stats = useAtomValue(statsAtom)
  const refresh = useAtomRefresh(statsAtom)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-sm font-medium">Thin coverage</h2>
        <p className="text-xs text-muted-foreground">Coins on a single market, which cannot have a transfer route.</p>
      </div>

      {AsyncResult.isInitial(stats) || AsyncResult.isWaiting(stats) ? (
        <DataTable>
          <Head>
            <Th>Coin</Th>
            <Th align="right">Markets</Th>
          </Head>
          <LoadingRows colSpan={thinColumns} />
        </DataTable>
      ) : AsyncResult.isFailure(stats) ? (
        <ErrorAlert
          title="Could not load thin coverage"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : stats.value.data.length === 0 ? (
        <EmptyState
          title="No thin coverage"
          description="Every coin is listed on at least two markets."
        />
      ) : (
        <DataTable>
          <Head>
            <Th>Coin</Th>
            <Th align="right">Markets</Th>
          </Head>
          <Body>
            {stats.value.data.map((coin) => (
              <Row key={coin.id}>
                <Td>
                  <Link
                    to={`/coins/${coin.id}/routes`}
                    className="font-medium uppercase underline-offset-4 hover:underline"
                  >
                    {coin.symbol}
                  </Link>
                </Td>
                <Td align="right">
                  <MarketsCell markets={coin.markets} />
                </Td>
              </Row>
            ))}
          </Body>
        </DataTable>
      )}
    </section>
  )
}

/**
 * Dashboard: coverage counts, worker health, and the two lists that need an
 * operator's attention.
 */
export const DashboardPage = () => {
  // One-row offset queries: only the page window reports the unpaginated total
  // in `meta.items`, so each count asks for page one explicitly.
  const coins = useAtomValue(coinStatsAtom({ limit: 1, page: 1 }))
  const exchanges = useAtomValue(exchangeListAtom({ limit: 1, page: 1 }))
  const chains = useAtomValue(chainListAtom({ limit: 1, page: 1 }))
  const markets = useAtomValue(marketIndexAtom())
  const workers = useAtomValue(workersAtom())

  const coinsTotal = AsyncResult.isSuccess(coins) ? coins.value.meta.items : undefined
  const exchangesTotal = AsyncResult.isSuccess(exchanges) ? exchanges.value.meta.items : undefined
  const chainsTotal = AsyncResult.isSuccess(chains) ? chains.value.meta.items : undefined

  // Markets have no count endpoint; the shared assignment index is the
  // cheapest total available, and market writes invalidate its reactivity key.
  const marketsTotal = AsyncResult.isSuccess(markets) ? markets.value.length : undefined

  const workerSummary = AsyncResult.isSuccess(workers)
    ? {
      running: workers.value.filter((worker) => worker.running).length,
      total: workers.value.length,
      reconnecting: workers.value.reduce(
        (total, worker) => total + worker.shards.filter((shard) => shard.phase === "reconnecting").length,
        0
      )
    }
    : undefined

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Coverage counts, worker health, and the routes that need attention."
      />

      <StatStrip
        stats={[
          { label: "Coins", value: countOrPending(coinsTotal), hint: "in the catalogue", to: "/coins" },
          { label: "Exchanges", value: countOrPending(exchangesTotal), hint: "registered venues", to: "/exchanges" },
          { label: "Chains", value: countOrPending(chainsTotal), hint: "networks in use", to: "/chains" },
          {
            label: "Markets",
            value: countOrPending(marketsTotal),
            hint: "coin and exchange assignments",
            to: "/coins"
          }
        ]}
      />

      <StatStrip
        stats={[
          {
            label: "Workers running",
            value: workerSummary === undefined
              ? "…"
              : `${formatCount(workerSummary.running)}/${formatCount(workerSummary.total)}`,
            hint: "desired state is reconciled automatically",
            to: "/workers"
          },
          {
            label: "Reconnecting shards",
            value: workerSummary === undefined ? "…" : formatCount(workerSummary.reconnecting),
            hint: "retrying their exchange connection",
            to: "/workers"
          }
        ]}
      />

      <BlockedRoutes />

      <ThinCoverage />
    </>
  )
}
