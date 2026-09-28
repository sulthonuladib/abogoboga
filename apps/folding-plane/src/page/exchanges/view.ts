import { AsyncData, Submodel } from 'foldkit'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import type { ExchangePage } from '../../api'
import { type ExchangesQuery, exchangeDetailUrl, exchangesUrl } from '../../route'
import { badge } from '../../ui/badge'
import { dialog } from '../../ui/dialog'
import { selectField, textField, toggleField } from '../../ui/field'
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
      title: 'Exchanges',
      description:
        'Venues a coin can be listed on. Search matches the name or slug; rows link to their market assignments.',
      actions: [
        action({
          label: 'New exchange',
          onClick: Message.ClickedNewExchange(),
          isPrimary: true,
          h,
        }),
      ],
      h,
    }),
    controlsView(model, h),
    exchangesView(model, h),
    pagerView(model, h),
    editorView(model, h),
    removeView(model, h),
  ]))

// CONTROLS

const controlsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class('flex flex-wrap items-center gap-3')], [
    searchField({
      id: 'exchange-search',
      value: model.query.search,
      placeholder: 'Search by name or slug',
      onInput: (value) => Message.UpdatedSearch({ value }),
      h,
    }),
    h.p([h.Class('text-sm text-muted-foreground')], [
      model.query.search === ''
        ? 'All exchanges'
        : `Matching “${model.query.search}”`,
    ]),
  ])

// EXCHANGES

const exchangesView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchDataSplitEmpty(model.exchanges, {
    onIdle: () => exchangesTableView(model, loadingRows(h), h),
    onLoading: () => exchangesTableView(model, loadingRows(h), h),
    onFailure: (detail) =>
      errorPanel({
        title: 'Could not load exchanges',
        detail,
        onRetry: Message.ClickedRetry(),
        h,
      }),
    onData: (page) => exchangesTableView(model, exchangeRows(page, model, h), h),
  })

const exchangesTableView = (
  model: Model,
  rows: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class('flex flex-col gap-3')], [
    table(h, [head(h, columnsView(model, h)), body(h, rows)]),
    ...Option.match(AsyncData.getError(model.exchanges), {
      onNone: () => [],
      onSome: (detail) => [
        staleNotice({ detail, onRetry: Message.ClickedRetry(), h }),
      ],
    }),
  ])

const columnsView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  sortableTh({
    label: 'Name',
    column: 'name',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  sortableTh({
    label: 'Slug',
    column: 'slug',
    sort: model.query.sort,
    order: model.query.order,
    onSort: (column) => Message.ClickedSort({ column }),
    h,
  }),
  th('Base currency', h),
  th('Registered on CMC', h),
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

const exchangeRows = (
  page: ExchangePage,
  model: Model,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.match(page.data, {
    onEmpty: () => [
      row(h, [
        emptyRow(
          h,
          model.query.search === ''
            ? 'No exchanges yet. Add the first exchange so coins can be assigned to a venue.'
            : 'No exchanges match. Try a shorter search, or add the exchange you are looking for.',
        ),
      ]),
    ],
    onNonEmpty: (exchanges) =>
      exchanges.map((exchange) =>
        h.keyed('tr')(String(exchange.id), [], [
          td(
            h,
            h.a(
              [
                h.Href(exchangeDetailUrl(exchange.id)),
                h.Class('font-medium underline-offset-4 hover:underline'),
              ],
              [exchange.name],
            ),
          ),
          td(h, exchange.slug),
          td(h, badge(exchange.baseCurrency.toUpperCase(), h, 'neutral', true)),
          td(h, exchange.registeredOnCmc ? 'yes' : 'no'),
          td(h, formatDate(exchange.createdAt), { isMuted: true }),
          td(
            h,
            h.div([h.Class('flex items-center justify-end gap-1')], [
              iconAction({
                label: `Edit ${exchange.name}`,
                icon: icon('pencil', h, 'size-3.5'),
                onClick: Message.ClickedEditExchange({
                  id: exchange.id,
                  name: exchange.name,
                  slug: exchange.slug,
                  coingeckoId: exchange.coingeckoId,
                  logo: exchange.logo,
                  baseCurrency: exchange.baseCurrency,
                  registeredOnCmc: exchange.registeredOnCmc,
                }),
                h,
              }),
              iconAction({
                label: `Remove ${exchange.name}`,
                icon: icon('trash', h, 'size-3.5'),
                onClick: Message.ClickedRemoveExchange({
                  id: exchange.id,
                  name: exchange.name,
                }),
                h,
              }),
            ]),
            { isNumeric: true },
          ),
        ])),
  })

const pagerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.match(model.exchanges, {
    onIdle: () => h.empty,
    onLoading: () => h.empty,
    onRefreshing: (data) => pager(data.meta, model.query, h),
    onFailure: () => h.empty,
    onStale: ({ data }) => pager(data.meta, model.query, h),
    onSuccess: (data) => pager(data.meta, model.query, h),
  })

const pager = (
  meta: ExchangePage['meta'],
  query: ExchangesQuery,
  h: HtmlBuilder<Message>,
): Html =>
  pagination({ meta, toHref: (page) => exchangesUrl({ ...query, page }), h })

// DIALOG

const editorView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.editor,
    title: editorTitle(model),
    description:
      'Exchanges are shared by every coin assigned to them; slug and CoinGecko id stay unique.',
    confirmLabel: confirmLabel(model),
    isConfirmDisabled: !isFormValid(model) || model.isSaving,
    onConfirm: Message.ClickedSaveExchange(),
    toParentMessage: (message) => Message.GotEditorMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-4')], [
      ...noticeView(model, h),
      textField({
        id: 'exchange-name',
        label: 'Name',
        field: model.name,
        placeholder: 'Binance',
        isAutofocus: true,
        onInput: (value) => Message.UpdatedExchangeName({ value }),
        h,
      }),
      textField({
        id: 'exchange-slug',
        label: 'Slug',
        field: model.slug,
        hint: 'Unique across exchanges and used in links.',
        placeholder: 'binance',
        onInput: (value) => Message.UpdatedExchangeSlug({ value }),
        h,
      }),
      textField({
        id: 'exchange-coingecko-id',
        label: 'CoinGecko id',
        field: model.coingeckoId,
        hint: 'The CoinGecko exchange identifier.',
        placeholder: 'binance',
        onInput: (value) => Message.UpdatedExchangeCoingeckoId({ value }),
        h,
      }),
      textField({
        id: 'exchange-logo',
        label: 'Logo',
        field: model.logo,
        hint: 'Optional image URL; blank keeps the symbol fallback.',
        placeholder: 'https://example.com/exchange.png',
        onInput: (value) => Message.UpdatedExchangeLogo({ value }),
        h,
      }),
      selectField({
        id: 'exchange-base-currency',
        label: 'Base currency',
        value: model.baseCurrency,
        choices: [
          { value: 'usdt', label: 'USDT' },
          { value: 'idr', label: 'IDR' },
        ],
        onChange: (value) =>
          Message.ChangedBaseCurrency({ value: value === 'idr' ? 'idr' : 'usdt' }),
        h,
      }),
      toggleField({
        id: 'exchange-registered-on-cmc',
        label: 'Registered on CoinMarketCap',
        isChecked: model.registeredOnCmc,
        onToggle: (isChecked) => Message.ToggledRegisteredOnCmc({ isChecked }),
        h,
      }),
      ...requiredHintView(model, h),
    ]),
    h,
  })

const requiredHintView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  isFormValid(model)
    ? []
    : [
      h.p([h.Class('text-xs text-muted-foreground')], [
        'Name, slug, and CoinGecko id are required.',
      ]),
    ]

const removeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  dialog({
    model: model.removeDialog,
    title: removeTitle(model),
    description:
      'Market assignments on this exchange are removed too, and the assigned coins lose the listing.',
    confirmLabel: 'Remove exchange',
    isDestructive: true,
    onConfirm: Message.ClickedConfirmRemoveExchange(),
    toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
    content: h.div([h.Class('flex flex-col gap-3')], [
      ...noticeView(model, h),
      h.p([h.Class('text-sm')], [
        Option.match(model.maybeRemoving, {
          onNone: () => '',
          onSome: ({ name }) =>
            `${name} is removed with every market assigned to it. Re-adding the exchange does not restore those assignments.`,
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
