import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { WorkerShardStatus, WorkerStatus } from "@lister/api/client"
import { Badge } from "@lister/ui/components/badge"
import { Button } from "@lister/ui/components/button"
import { CaretDownIcon, CaretRightIcon, PlayIcon, PulseIcon, StopIcon } from "@phosphor-icons/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useEffect, useState } from "react"
import { workersAtom } from "../api/atoms.ts"
import { workersKey } from "../api/keys.ts"
import { runMutation, workerMutations } from "../api/mutations.ts"
import { formatAgo, formatCount, pluralize } from "../lib/format.ts"
import { PageHeader } from "../ui/PageHeader.tsx"
import { EmptyState, ErrorAlert, IconAction, RetryButton } from "../ui/States.tsx"
import { StatStrip } from "../ui/StatStrip.tsx"
import { Body, DataTable, Head, LoadingRows, Row, Td, Th } from "../ui/Table.tsx"

const columns = 6

const phaseBadge = (phase: WorkerShardStatus["phase"]) => {
  if (phase === "running") return <Badge variant="secondary">running</Badge>

  if (phase === "reconnecting") return <Badge variant="destructive">reconnecting</Badge>

  return <Badge variant="outline">starting</Badge>
}

/**
 * Shard list for one worker, shown when a row is expanded.
 */
const ShardRows = (props: { readonly shards: ReadonlyArray<WorkerShardStatus>; readonly now: number }) => (
  <Body>
    {props.shards.map((shard) => (
      <Row key={shard.shardId}>
        <Td className="pl-10 font-medium">{shard.shardId}</Td>
        <Td>{phaseBadge(shard.phase)}</Td>
        <Td align="right">{formatCount(shard.size)}</Td>
        <Td align="right">{formatCount(shard.restarts)}</Td>
        <Td align="right">{shard.attempt === null ? "—" : formatCount(shard.attempt)}</Td>
        <Td align="right" className="text-muted-foreground">
          {formatAgo(shard.lastTickAt, props.now)}
        </Td>
      </Row>
    ))}
  </Body>
)

/**
 * One worker row with its shard expansion and lifecycle controls.
 */
const WorkerRow = (props: {
  readonly worker: WorkerStatus
  readonly expanded: boolean
  readonly pending: boolean
  readonly now: number
  readonly onToggle: () => void
  readonly onStart: () => void
  readonly onStop: () => void
}) => {
  const { worker } = props

  const worstPhase = worker.shards.find((shard) => shard.phase === "reconnecting")?.phase ??
    worker.shards.find((shard) => shard.phase === "starting")?.phase ??
    "running"

  return (
    <>
      <Row>
        <Td>
          <div className="flex items-center gap-2">
            <IconAction
              label={props.expanded ? "Hide shards" : "Show shards"}
              onClick={props.onToggle}
              disabled={worker.shards.length === 0}
            >
              {props.expanded ? (
                <CaretDownIcon className="size-3.5" />
              ) : (
                <CaretRightIcon className="size-3.5" />
              )}
            </IconAction>
            <span className="font-medium">{worker.exchangeSlug}</span>
          </div>
        </Td>
        <Td>
          <Badge variant={worker.running ? "secondary" : "outline"}>{worker.running ? "running" : "stopped"}</Badge>
        </Td>
        <Td>
          <span className="text-muted-foreground">
            {worker.shards.length === 0
              ? "no shards"
              : `${pluralize(worker.shards.length, "shard")} · ${worstPhase}`}
          </span>
        </Td>
        <Td align="right">{formatCount(worker.restarts)}</Td>
        <Td align="right">{formatCount(worker.eligibleCoins)}</Td>
        <Td align="right">
          {worker.running ? (
            <Button variant="outline" size="sm" onClick={props.onStop} disabled={props.pending}>
              <StopIcon data-icon="inline-start" />
              Stop
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={props.onStart} disabled={props.pending}>
              <PlayIcon data-icon="inline-start" />
              Start
            </Button>
          )}
        </Td>
      </Row>
      {props.expanded ? <ShardRows shards={worker.shards} now={props.now} /> : null}
    </>
  )
}

/**
 * Worker monitoring page: desired versus actual state, shard detail, and
 * start/stop controls. Status polls while the page is open.
 */
export const WorkersPage = () => {
  const workers = useAtomValue(workersAtom())
  const refresh = useAtomRefresh(workersAtom())
  const start = useAtomSet(workerMutations.start, { mode: "promiseExit" })
  const stop = useAtomSet(workerMutations.stop, { mode: "promiseExit" })

  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      refresh()
      setNow(Date.now())
    }, 5000)

    return () => clearInterval(timer)
  }, [refresh])

  const withPending = useCallback(
    async <Result,>(exchangeId: number, run: () => Promise<Result>) => {
      setPending((current) => new Set(current).add(exchangeId))

      try {
        await run()
      } finally {
        setPending((current) => {
          const next = new Set(current)

          next.delete(exchangeId)

          return next
        })
      }
    },
    []
  )

  const onStart = useCallback(
    (exchangeId: number) => {
      void withPending(exchangeId, () =>
        runMutation(
          () => start({ params: { exchangeId }, reactivityKeys: [workersKey] }),
          { success: "Worker starting", failure: "Could not start worker" }
        )
      )
    },
    [start, withPending]
  )

  const onStop = useCallback(
    (exchangeId: number) => {
      void withPending(exchangeId, () =>
        runMutation(
          () => stop({ params: { exchangeId }, reactivityKeys: [workersKey] }),
          { success: "Worker stopping", failure: "Could not stop worker" }
        )
      )
    },
    [stop, withPending]
  )

  const workersValue = AsyncResult.isSuccess(workers) ? workers.value : undefined

  const running = workersValue?.filter((worker) => worker.running) ?? []

  const reconnecting = workersValue?.flatMap((worker) =>
    worker.shards.filter((shard) => shard.phase === "reconnecting")
  ) ?? []

  return (
    <>
      <PageHeader
        title="Workers"
        description="Crawler shards per exchange. Status refreshes every five seconds while this page is open."
      />

      <StatStrip
        stats={[
          {
            label: "Running",
            value: workersValue === undefined ? "…" : `${formatCount(running.length)}/${formatCount(workersValue.length)}`,
            hint: "desired state is reconciled automatically"
          },
          {
            label: "Reconnecting shards",
            value: workersValue === undefined ? "…" : formatCount(reconnecting.length),
            hint: "retrying their exchange connection"
          },
          {
            label: "Restarts",
            value: workersValue === undefined
              ? "…"
              : formatCount(workersValue.reduce((total, worker) => total + worker.restarts, 0)),
            hint: "across all workers"
          },
          {
            label: "Eligible coins",
            value: workersValue === undefined
              ? "…"
              : formatCount(workersValue.reduce((total, worker) => total + worker.eligibleCoins, 0)),
            hint: "assigned to running workers"
          }
        ]}
      />

      {AsyncResult.isInitial(workers) || AsyncResult.isWaiting(workers) ? (
        <DataTable>
          <Head>
            <Th>Exchange</Th>
            <Th>State</Th>
            <Th>Shards</Th>
            <Th align="right">Restarts</Th>
            <Th align="right">Eligible coins</Th>
            <Th align="right">Actions</Th>
          </Head>
          <LoadingRows colSpan={columns} />
        </DataTable>
      ) : AsyncResult.isFailure(workers) ? (
        <ErrorAlert
          title="Could not load workers"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : workers.value.length === 0 ? (
        <EmptyState
          icon={PulseIcon}
          title="No exchanges yet"
          description="Workers run per exchange; add an exchange first."
        />
      ) : (
        <DataTable>
          <Head>
            <Th>Exchange</Th>
            <Th>State</Th>
            <Th>Shards</Th>
            <Th align="right">Restarts</Th>
            <Th align="right">Eligible coins</Th>
            <Th align="right">Actions</Th>
          </Head>
          <Body>
            {workers.value.map((worker) => (
              <WorkerRow
                key={worker.exchangeId}
                worker={worker}
                now={now}
                pending={pending.has(worker.exchangeId)}
                expanded={expanded.has(worker.exchangeId)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current)

                    if (next.has(worker.exchangeId)) {
                      next.delete(worker.exchangeId)
                    } else {
                      next.add(worker.exchangeId)
                    }

                    return next
                  })}
                onStart={() => onStart(worker.exchangeId)}
                onStop={() => onStop(worker.exchangeId)}
              />
            ))}
          </Body>
        </DataTable>
      )}
    </>
  )
}
