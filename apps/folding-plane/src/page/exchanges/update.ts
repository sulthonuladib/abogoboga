import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Dialog } from '@foldkit/ui'
import { AsyncData, Command, FieldValidation, Update } from 'foldkit'
import { pushUrl, replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type ExchangePage, Query, call } from '../../api'
import { ExchangesQuery, type Order, defaultExchangesQuery, exchangesUrl } from '../../route'
import { trimmedOrEmpty } from '../../ui/format'
import { searchDelay } from '../../ui/search'
import { Message, OutMessage } from './message'
import {
  type Exchanges,
  Model,
  coingeckoIdRules,
  initialModel,
  isFormValid,
  logoRules,
  nameRules,
  pageSize,
  slugRules,
} from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const validateName = FieldValidation.validate(nameRules)
const validateSlug = FieldValidation.validate(slugRules)
const validateCoingeckoId = FieldValidation.validate(coingeckoIdRules)
const validateLogo = FieldValidation.validate(logoRules)

const flipped = (order: Order): Order => (order === 'asc' ? 'desc' : 'asc')

// COMMAND

/**
 * The search this listing runs, one keystroke at a time. The Command is
 * interruptible by name, so the next keystroke stops the pending wait instead
 * of racing it, and only the last one reaches the URL.
 */
export const SearchExchanges = Command.define('SearchExchanges', {
  args: { search: Schema.String },
  messages: [Message.CompletedSearchExchanges, Message.CompletedInterruptSearchExchanges],
  interrupt: true,
  execute: ({ search }) =>
    Effect.sleep(searchDelay).pipe(
      Effect.andThen(replaceUrl(exchangesUrl({ ...defaultExchangesQuery, search }))),
      Effect.as(Message.CompletedSearchExchanges()),
      Effect.catch(() => Effect.succeed(Message.CompletedSearchExchanges())),
    ),
})

const interruptSearch = () =>
  SearchExchanges.Interrupt((outcome) =>
    Message.CompletedInterruptSearchExchanges({ outcome }))

/**
 * A change of sort or page. It is a navigation rather than a local
 * transition, so the URL always describes the table on screen.
 */
export const NavigateExchanges = Command.define('NavigateExchanges', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateExchanges],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateExchanges())),
})

/**
 * The read behind the listing. It requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders.
 */
export const readExchanges = (
  query: ExchangesQuery,
): Effect.Effect<ExchangePage, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.listExchanges({ ...query, limit: pageSize })

export const FetchExchanges = Command.define('FetchExchanges', {
  args: { query: ExchangesQuery },
  messages: [Message.SettledFetchExchanges],
  execute: ({ query }) =>
    call(readExchanges(query)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchExchanges({ result })),
    ),
})

export const AddExchange = Command.define('AddExchange', {
  args: {
    name: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
    logo: Schema.String,
    baseCurrency: Schema.Literals(['usdt', 'idr']),
    registeredOnCmc: Schema.Boolean,
  },
  messages: [Message.SucceededSaveExchange, Message.FailedSaveExchange],
  execute: (input) =>
    call(Query.addExchange(input)).pipe(
      Effect.map((exchange) => Message.SucceededSaveExchange({ name: exchange.name })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveExchange({ detail: error.detail })),
      ),
    ),
})

export const SaveExchange = Command.define('SaveExchange', {
  args: {
    id: Schema.Int,
    name: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
    logo: Schema.String,
    baseCurrency: Schema.Literals(['usdt', 'idr']),
    registeredOnCmc: Schema.Boolean,
  },
  messages: [Message.SucceededSaveExchange, Message.FailedSaveExchange],
  execute: ({ id, ...input }) =>
    call(Query.updateExchange(id, input)).pipe(
      Effect.map((exchange) => Message.SucceededSaveExchange({ name: exchange.name })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveExchange({ detail: error.detail })),
      ),
    ),
})

export const DeleteExchange = Command.define('DeleteExchange', {
  args: { id: Schema.Int },
  messages: [Message.SucceededRemoveExchange, Message.FailedRemoveExchange],
  execute: ({ id }) =>
    call(Query.removeExchange(id)).pipe(
      Effect.map((exchange) => Message.SucceededRemoveExchange({ name: exchange.name })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedRemoveExchange({ detail: error.detail })),
      ),
    ),
})

// FOLD

const keepModel: Update.Step<Model, Message> = (model) => ({ model })

const foldEditorOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => keepModel,
  Closed: () => keepModel,
})

const foldEditor = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.editor),
  write: (model, nextEditor) => modifyFields(model, { editor: () => nextEditor }),
  toParentMessage: (message) => Message.GotEditorMessage({ message }),
  foldOutMessage: foldEditorOutMessage,
})

const foldRemoveDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => keepModel,
  Closed: () => keepModel,
})

const foldRemoveDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.removeDialog),
  write: (model, nextRemoveDialog) =>
    modifyFields(model, { removeDialog: () => nextRemoveDialog }),
  toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
  foldOutMessage: foldRemoveDialogOutMessage,
})

const closeEditor = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.editor),
  write: (model, nextEditor) => modifyFields(model, { editor: () => nextEditor }),
  toParentMessage: (message) => Message.GotEditorMessage({ message }),
  foldOutMessage: foldEditorOutMessage,
})

const openEditor = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.editor),
  write: (model, nextEditor) => modifyFields(model, { editor: () => nextEditor }),
  toParentMessage: (message) => Message.GotEditorMessage({ message }),
  foldOutMessage: foldEditorOutMessage,
})

const closeRemoveDialog = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.removeDialog),
  write: (model, nextRemoveDialog) =>
    modifyFields(model, { removeDialog: () => nextRemoveDialog }),
  toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
  foldOutMessage: foldRemoveDialogOutMessage,
})

const openRemoveDialog = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.removeDialog),
  write: (model, nextRemoveDialog) =>
    modifyFields(model, { removeDialog: () => nextRemoveDialog }),
  toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
  foldOutMessage: foldRemoveDialogOutMessage,
})

// LOAD

const loadQuery = (model: Model, query: ExchangesQuery): Update.Return<Model, Message> => ({
  model: modifyFields(model, {
    query: () => query,
    exchanges: () => AsyncData.Loading(),
  }),
  commands: [FetchExchanges({ query })],
})

const refresh: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.exchanges), {
    onNone: () => ({ model }),
    onSome: (exchanges) => ({
      model: modifyFields(model, { exchanges: () => exchanges }),
      commands: [FetchExchanges({ query: model.query })],
    }),
  })

const sameQuery = (current: ExchangesQuery, next: ExchangesQuery): boolean =>
  current.search === next.search &&
  current.sort === next.sort &&
  current.order === next.order &&
  current.page === next.page

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the first page of exchanges is on its way.
 */
export const init = (
  query: ExchangesQuery,
  maybeExchanges: Option.Option<Exchanges>,
): UpdateReturn =>
  Option.match(maybeExchanges, {
    onNone: () => loadQuery(initialModel, query),
    onSome: (exchanges) => ({
      model: modifyFields(initialModel, {
        query: () => query,
        exchanges: () => exchanges,
      }),
    }),
  })

/**
 * Tell the page the URL changed. The page owns no route, so it derives its
 * query from the one it is given and returns the fetch that query needs. A
 * click that leaves the query as it was fetches nothing, unless the page
 * never loaded at all: arriving from another page on the query the listing
 * already holds still needs its first read.
 */
export const informRouteChanged = (
  model: Model,
  query: ExchangesQuery,
): Update.Return<Model, Message> =>
  sameQuery(model.query, query) && !AsyncData.isIdle(model.exchanges)
    ? { model }
    : loadQuery(model, query)

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedSearch: ({ value }) => ({
      model: modifyFields(model, {
        query: (query) => modifyFields(query, { search: () => value }),
      }),
      commands: [interruptSearch(), SearchExchanges({ search: value })],
    }),

    CompletedSearchExchanges: () => ({ model }),
    CompletedInterruptSearchExchanges: () => ({ model }),
    CompletedNavigateExchanges: () => ({ model }),

    ClickedSort: ({ column }) => {
      const order = model.query.sort === column ? flipped(model.query.order) : 'asc'

      return {
        model,
        commands: [
          NavigateExchanges({
            url: exchangesUrl({ ...model.query, sort: column, order, page: 1 }),
          }),
        ],
      }
    },

    ClickedRetry: () => refresh(model),

    ClickedNewExchange: () =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.none(),
            name: () => FieldValidation.NotValidated({ value: '' }),
            slug: () => FieldValidation.NotValidated({ value: '' }),
            coingeckoId: () => FieldValidation.NotValidated({ value: '' }),
            logo: () => FieldValidation.NotValidated({ value: '' }),
            baseCurrency: () => 'usdt' as const,
            registeredOnCmc: () => true,
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openEditor,
      ]),

    ClickedEditExchange: ({ id, name, slug, coingeckoId, logo, baseCurrency, registeredOnCmc }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.some({ id }),
            name: () => FieldValidation.Valid({ value: name }),
            slug: () => FieldValidation.Valid({ value: slug }),
            coingeckoId: () => FieldValidation.Valid({ value: coingeckoId }),
            logo: () => validateLogo(logo),
            baseCurrency: () => baseCurrency,
            registeredOnCmc: () => registeredOnCmc,
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openEditor,
      ]),

    UpdatedExchangeName: ({ value }) => ({
      model: modifyFields(model, { name: () => validateName(value) }),
    }),

    UpdatedExchangeSlug: ({ value }) => ({
      model: modifyFields(model, { slug: () => validateSlug(value) }),
    }),

    UpdatedExchangeCoingeckoId: ({ value }) => ({
      model: modifyFields(model, { coingeckoId: () => validateCoingeckoId(value) }),
    }),

    UpdatedExchangeLogo: ({ value }) => ({
      model: modifyFields(model, { logo: () => validateLogo(value) }),
    }),

    ChangedBaseCurrency: ({ value }) => ({
      model: modifyFields(model, { baseCurrency: () => value }),
    }),

    ToggledRegisteredOnCmc: ({ isChecked }) => ({
      model: modifyFields(model, { registeredOnCmc: () => isChecked }),
    }),

    ClickedSaveExchange: () => {
      const name = trimmedOrEmpty(model.name.value)
      const slug = trimmedOrEmpty(model.slug.value)
      const coingeckoId = trimmedOrEmpty(model.coingeckoId.value)
      const logo = trimmedOrEmpty(model.logo.value)
      const validated = modifyFields(model, {
        name: () => validateName(name),
        slug: () => validateSlug(slug),
        coingeckoId: () => validateCoingeckoId(coingeckoId),
        logo: () => validateLogo(logo),
      })

      if (!isFormValid(validated)) {
        return { model: modifyFields(validated, { isSaving: () => false }) }
      }

      const payload = {
        name,
        slug,
        coingeckoId,
        logo,
        baseCurrency: model.baseCurrency,
        registeredOnCmc: model.registeredOnCmc,
      }

      return Option.match(model.editing, {
        onNone: () => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [AddExchange(payload)],
        }),
        onSome: ({ id }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [SaveExchange({ id, ...payload })],
        }),
      })
    },

    SucceededSaveExchange: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({ model: modifyFields(model, { isSaving: () => false }) }),
          closeEditor,
          refresh,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedSaveExchange: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    ClickedRemoveExchange: ({ id, name }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            maybeRemoving: () => Option.some({ id, name }),
          }),
        }),
        openRemoveDialog,
      ]),

    ClickedConfirmRemoveExchange: () =>
      Option.match(model.maybeRemoving, {
        onNone: () => ({ model }),
        onSome: ({ id }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [DeleteExchange({ id })],
        }),
      }),

    SucceededRemoveExchange: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, {
              maybeRemoving: () => Option.none(),
              isSaving: () => false,
            }),
          }),
          closeRemoveDialog,
          refresh,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedRemoveExchange: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    SettledFetchExchanges: ({ result }) => ({
      model: modifyFields(model, { exchanges: AsyncData.settle(result) }),
    }),

    GotEditorMessage: ({ message }) => foldEditor(model, message),
    GotRemoveDialogMessage: ({ message }) => foldRemoveDialog(model, message),
  })
