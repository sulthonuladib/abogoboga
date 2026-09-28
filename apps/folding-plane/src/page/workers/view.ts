import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { WorkerStatus } from '../../api'
import { badge } from '../../ui/badge'
import { formatCount, pendingCount } from '../../ui/format'
import { pageHeader, statStrip } from '../../ui/pageHeader'
import { emptyState, errorPanel } from '../../ui/states'
import {
  body,
  head,
  loadingRows,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import { Model, isPending } from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    pageHeader({
      title: 'Workers',
      description: 'Crawler shards per exchange, with the desired state and what is actually running.',
      h,
    }),
    ...noticeView(model, h),
    statsView(model, h),
    workersView(model, h),
  ]))

// NOTICE

/**
 * The reason the last start or stop was refused, shown where it was made.
 * A redundant request leaves the row unchanged and names why.
 */
const noticeView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(model.notice, {
    onNone: () => [],
    onSome: (detail) => [
      h.div(
        [
          h.Class('rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3'),
          h.Role('alert'),
        ],
        [
          h.p([h.Class('text-sm font-medium text-destructive')], ['Worker request refused']),
          h.p([h.Class('text-sm text-muted-foreground')], [detail]),
        ],
      ),
    ],
  })

// STATS

const statsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(AsyncData.getData(model.workers), {
    onNone: () =>
      statStrip(
        [
          { label: 'Running', value: pendingCount, hint: 'desired state is reconciled automatically' },
          { label: 'Reconnecting shards', value: pendingCount, hint: 'retrying their exchange connection' },
          { label: 'Eligible coins', value: pendingCount, hint: 'assigned to running workers' },
        ],
        h,
      ),
    onSome: (workers) => {
      const running = workers.filter((worker) => worker.running)
      const reconnecting = workers.flatMap((worker) =>
        worker.shards.filter((shard) => shard.phase === 'reconnecting')
      )

      return statStrip(
        [
          {
            label: 'Running',
            value: `${formatCount(running.length)}/${formatCount(workers.length)}`,
            hint: 'desired state is reconciled automatically',
          },
          {
            label: 'Reconnecting shards',
            value: formatCount(reconnecting.length),
            hint: 'retrying their exchange connection',
          },
          {
            label: 'Eligible coins',
            value: formatCount(workers.reduce((total, worker) => total + worker.eligibleCoins, 0)),
            hint: 'assigned to running workers',
          },
        ],
        h,
      )
    },
  })

// WORKERS

const workersView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.workers, {
    onIdle: () => workersTableView(loadingRows(h), h),
    onLoading: () => workersTableView(loadingRows(h), h),
    onRefreshing: (workers) => workersTableView(workerRows(workers, model, h), h),
    onFailure: (detail) =>
      errorPanel({
        title: 'Could not load workers',
        detail,
        onRetry: Message.ClickedRetry(),
        h,
      }),
    onStale: ({ data }) => workersTableView(workerRows(data, model, h), h),
    onSuccess: (workers) =>
      Array.match(workers, {
        onEmpty: () =>
          emptyState({
            title: 'No exchanges yet',
            description: 'Workers run per exchange; add an exchange first.',
            h,
          }),
        onNonEmpty: () => workersTableView(workerRows(workers, model, h), h),
      }),
  })

const workersTableView = (
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  table(h, [
    head(h, [
      th('Exchange', h),
      th('Desired', h),
      th('State', h),
      th('Shards', h),
      th('Restarts', h, true),
      th('Eligible coins', h, true),
      th('Actions', h, true),
    ]),
    body(h, rows),
  ])

const workerRows = (
  workers: ReadonlyArray<WorkerStatus>,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  workers.map((worker) =>
    h.keyed('tr')(String(worker.exchangeId), [], [
      td(h, h.span([h.Class('font-medium')], [worker.exchangeSlug])),
      td(h, badge(worker.desired, h, worker.desired === 'started' ? 'positive' : 'neutral')),
      td(h, badge(worker.running ? 'running' : 'stopped', h, worker.running ? 'positive' : 'neutral')),
      td(h, shardsCell(worker, h)),
      td(h, formatCount(worker.restarts), { isNumeric: true }),
      td(h, formatCount(worker.eligibleCoins), { isNumeric: true }),
      td(h, workerAction(worker, model, h), { isNumeric: true }),
    ]))

const shardsCell = (worker: WorkerStatus, h: HtmlBuilder<Message>): Html => {
  if (worker.shards.length === 0) {
    return h.span([h.Class('text-muted-foreground')], ['no shards'])
  }

  const worst = worker.shards.find((shard) => shard.phase === 'reconnecting')?.phase ??
    worker.shards.find((shard) => shard.phase === 'starting')?.phase ??
    'running'

  return h.span([h.Class('flex flex-wrap items-center gap-1')], [
    h.span([h.Class('text-muted-foreground')], [
      `${worker.shards.length} ${worker.shards.length === 1 ? 'shard' : 'shards'} · ${worst}`,
    ]),
    ...worker.shards.map((shard) =>
      h.span(
        [h.Class('inline-flex items-center gap-1 text-xs')],
        [
          badge(shard.phase, h, shard.phase === 'running' ? 'positive' : shard.phase === 'reconnecting' ? 'critical' : 'neutral'),
          h.span([h.Class('tabular-nums text-muted-foreground')], [`restarts ${formatCount(shard.restarts)}`]),
        ],
      )
    ),
  ])
}

const workerAction = (
  worker: WorkerStatus,
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const pending = isPending(model, worker.exchangeId)

  if (worker.running) {
    return h.button(
      [
        h.Type('button'),
        pending ? h.Disabled(true) : h.OnClick(Message.ClickedStopWorker({ exchangeId: worker.exchangeId })),
        h.AriaLabel(`Stop ${worker.exchangeSlug}`),
        h.Class('rounded-lg bg-card px-2.5 py-1 text-xs shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)] disabled:cursor-not-allowed disabled:opacity-50'),
      ],
      ['Stop'],
    )
  }

  return h.button(
    [
      h.Type('button'),
      pending ? h.Disabled(true) : h.OnClick(Message.ClickedStartWorker({ exchangeId: worker.exchangeId })),
      h.AriaLabel(`Start ${worker.exchangeSlug}`),
      h.Class('rounded-lg bg-card px-2.5 py-1 text-xs shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)] disabled:cursor-not-allowed disabled:opacity-50'),
    ],
    ['Start'],
  )
}
