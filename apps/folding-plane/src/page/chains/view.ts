import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { ChainPage } from '../../api'
import { type ChainsQuery, chainDetailUrl, chainsUrl, pageSizeChoices } from '../../route'
import { dialog } from '../../ui/dialog'
import { textField } from '../../ui/field'
import { pageSizeSelect, searchFieldsField } from '../../ui/filters'
import { formatDate } from '../../ui/format'
import { icon } from '../../ui/icon'
import { action, iconAction, pageHeader } from '../../ui/pageHeader'
import { pagination } from '../../ui/pagination'
import { searchField } from '../../ui/search'
import { errorPanel, staleNotice } from '../../ui/states'
import {
  body,
  emptyRow,
  head,
  loadingRows,
  row,
  sortableTh,
  table,
  td,
  th,
} from '../../ui/table'
import { Message } from './message'
import {
  Model,
  confirmLabel,
  editorTitle,
  isFormValid,
  removeTitle,
} from './model'

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div([h.Class('flex flex-col gap-6')], [
    pageHeader({
      title: 'Chains',
      description:
        'Networks a market can move value on. Chains are shared across exchanges, and codes are unique.',
      actions: [
        action({
          label: 'New chain',
          onClick: Message.ClickedNewChain(),
          isPrimary: true,
          h,
        }),
      ],
      h,
    }),
    controlsView(model, h),
    chainsView(model, h),
    pagerView(model, h),
    editorView(model, h),
    removeView(model, h),
  ]))

// CONTROLS

const searchFieldChoices = [
  { field: 'name', label: 'Name' },
  { field: 'code', label: 'Code' },
] as const

const controlsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    h.div([h.Class('flex flex-wrap items-center gap-3')], [
      searchField({
        id: 'chain-search',
        value: model.query.search,
        placeholder: 'Search chains',
        onInput: (value) => Message.UpdatedSearch({ value }),
        h,
      }),
      h.p([h.Class('text-sm text-muted-foreground')], [
        model.query.search === ''
          ? 'All chains'
          : `Matching “${model.query.search}”`,
      ]),
    ]),
    searchFieldsField({
      legend: 'Search fields',
      choices: searchFieldChoices,
      selected: model.query.searchBy,
      onToggle: (field, isChecked) => Message.ToggledSearchField({ field, isChecked }),
      h,
    }),
  ])

// CHAINS

const chainsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchDataSplitEmpty(model.chains, {
    onIdle: () => chainsTableView(model, loadingRows(h), h),
    onLoading: () => chainsTableView(model, loadingRows(h), h),
    onFailure: (detail) =>
      errorPanel({
        title: 'Could not load chains',
        detail,
        onRetry: Message.ClickedRetry(),
        h,
      }),
    onData: (page) => chainsTableView(model, chainRows(page, model, h), h),
  })

const chainsTableView = (
  model: Model,
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    table(h, [head(h, columnsView(model, h)), body(h, rows)]),
    ...Option.match(AsyncData.getError(model.chains), {
      onNone: () => [],
      onSome: (detail) => [
        staleNotice({ detail, onRetry: Message.ClickedRetry(), h }),
      ],
    }),
  ])

const columnsView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  sortableTh({
    label: 'Code',
    column: 'code',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Name',
    column: 'name',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Created',
    column: 'createdAt',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  th('Actions', h, true),
]

const chainRows = (
  page: ChainPage,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(page.data, {
    onEmpty: () => [
      row(h, [
        emptyRow(
          h,
          model.query.search === ''
            ? 'No chains yet. Add the first chain to start linking markets.'
            : 'No chains match. Try a shorter search, or add the chain you are looking for.',
        ),
      ]),
    ],
    onNonEmpty: (chains) =>
      chains.map((chain) =>
        h.keyed('tr')(String(chain.id), [], [
          td(
            h,
            h.a(
              [
                h.Href(chainDetailUrl(chain.id)),
                h.Class('font-medium uppercase underline-offset-4 hover:underline'),
              ],
              [chain.code],
            ),
          ),
          td(h, chain.name),
          td(h, formatDate(chain.createdAt), { isMuted: true }),
          td(
            h,
            h.div([h.Class('flex items-center justify-end gap-1')], [
              iconAction({
                label: `Edit ${chain.code}`,
                icon: icon('pencil', h, 'size-3.5'),
                onClick: Message.ClickedEditChain({
                  id: chain.id,
                  name: chain.name,
                  code: chain.code,
                }),
                h,
              }),
              iconAction({
                label: `Remove ${chain.code}`,
                icon: icon('trash', h, 'size-3.5'),
                onClick: Message.ClickedRemoveChain({
                  id: chain.id,
                  code: chain.code,
                }),
                h,
              }),
            ]),
            { isNumeric: true },
          ),
        ])),
  })

const pagerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.chains, {
    onIdle: () => h.empty,
    onLoading: () => h.empty,
    onRefreshing: (data) => pager(data.meta, model.query, h),
    onFailure: () => h.empty,
    onStale: ({ data }) => pager(data.meta, model.query, h),
    onSuccess: (data) => pager(data.meta, model.query, h),
  })

const pager = (
  meta: ChainPage['meta'],
  query: ChainsQuery,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-wrap items-center justify-between gap-3')], [
    pagination({ meta, toHref: (page) => chainsUrl({ ...query, page }), h }),
    pageSizeSelect({
      id: 'chains-page-size',
      value: query.limit,
      choices: pageSizeChoices,
      onChange: (value) => Message.ChangedPageSize({ value }),
      h,
    }),
  ])

// DIALOG

const editorView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.editor,
    title: editorTitle(model),
    description:
      'The code identifies the chain across every exchange, for example ETH.',
    confirmLabel: confirmLabel(model),
    isConfirmDisabled: !isFormValid(model) || model.isSaving,
    onConfirm: Message.ClickedSaveChain(),
    toParentMessage: (message) => Message.GotEditorMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model, h),
      textField({
        id: 'chain-code',
        label: 'Code',
        field: model.code,
        hint: 'Unique across chains, as the exchanges write it.',
        placeholder: 'ETH',
        isAutofocus: true,
        onInput: (value) => Message.UpdatedChainCode({ value }),
        h,
      }),
      textField({
        id: 'chain-name',
        label: 'Name',
        field: model.name,
        placeholder: 'Ethereum',
        onInput: (value) => Message.UpdatedChainName({ value }),
        h,
      }),
    ]),
    h,
  })

const removeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.removeDialog,
    title: removeTitle(model),
    description:
      'Markets linked to this chain lose the link, and the routes through it disappear.',
    confirmLabel: 'Remove chain',
    isDestructive: true,
    size: 'sm',
    onConfirm: Message.ClickedConfirmRemoveChain(),
    toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-3')], [
      ...noticeView(model, h),
      h.p([h.Class('text-sm')], [
        Option.match(model.maybeRemoving, {
          onNone: () => '',
          onSome: ({ code }) =>
            `${code} is unlinked from every market that routes through it. Re-adding the chain does not restore those links.`,
        }),
      ]),
    ]),
    h,
  })

/**
 * The reason the last write failed, shown where the write was made.
 */
const noticeView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(model.notice, {
    onNone: () => [],
    onSome: (detail) => [
      h.p(
        [h.Class('rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive')],
        [detail],
      ),
    ],
  })
