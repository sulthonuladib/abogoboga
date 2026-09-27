import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Dialog } from '@foldkit/ui'
import { AsyncData, Command, FieldValidation, Update } from 'foldkit'
import { pushUrl, replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { call, Query, type ApiFailure, type ApiOrigin, type ChainPage } from '../../api'
import { ChainsQuery, chainsUrl, defaultChainsQuery, type Order } from '../../route'
import { searchDelay } from '../../ui/search'
import { Message, OutMessage } from './message'
import {
  codeRules,
  initialModel,
  Model,
  nameRules,
  pageSize,
  type Chains,
} from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const validateName = FieldValidation.validate(nameRules)
const validateCode = FieldValidation.validate(codeRules)

const flipped = (order: Order): Order => (order === 'asc' ? 'desc' : 'asc')

// COMMAND

/**
 * The search this listing runs, one keystroke at a time. The Command is
 * interruptible by name, so the next keystroke stops the pending wait instead
 * of racing it, and only the last one reaches the URL.
 */
export const SearchChains = Command.define('SearchChains', {
  args: { search: Schema.String },
  messages: [Message.CompletedSearchChains, Message.CompletedInterruptSearchChains],
  interrupt: true,
  execute: ({ search }) =>
    Effect.sleep(searchDelay).pipe(
      Effect.andThen(replaceUrl(chainsUrl({ ...defaultChainsQuery, search }))),
      Effect.as(Message.CompletedSearchChains()),
      Effect.catch(() => Effect.succeed(Message.CompletedSearchChains())),
    ),
})

const interruptSearch = () =>
  SearchChains.Interrupt((outcome) =>
    Message.CompletedInterruptSearchChains({ outcome }))

/**
 * A change of sort, page, or filter. It is a navigation rather than a local
 * transition, so the URL always describes the table on screen.
 */
const NavigateChains = Command.define('NavigateChains', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateChains],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateChains())),
})

/**
 * The read behind the listing. It requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders.
 */
export const readChains = (
  query: ChainsQuery,
): Effect.Effect<ChainPage, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.listChains({ ...query, limit: pageSize })

const FetchChains = Command.define('FetchChains', {
  args: { query: ChainsQuery },
  messages: [Message.SettledFetchChains],
  execute: ({ query }) =>
    call(readChains(query)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchChains({ result })),
    ),
})

const AddChain = Command.define('AddChain', {
  args: { name: Schema.String, code: Schema.String },
  messages: [Message.SucceededSaveChain, Message.FailedSaveChain],
  execute: ({ name, code }) =>
    call(Query.addChain({ name, code })).pipe(
      Effect.map((chain) => Message.SucceededSaveChain({ code: chain.code })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveChain({ detail: error.detail })),
      ),
    ),
})

const SaveChain = Command.define('SaveChain', {
  args: { id: Schema.Int, name: Schema.String, code: Schema.String },
  messages: [Message.SucceededSaveChain, Message.FailedSaveChain],
  execute: ({ id, name, code }) =>
    call(Query.updateChain(id, { name, code })).pipe(
      Effect.map((chain) => Message.SucceededSaveChain({ code: chain.code })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveChain({ detail: error.detail })),
      ),
    ),
})

const DeleteChain = Command.define('DeleteChain', {
  args: { id: Schema.Int },
  messages: [Message.SucceededRemoveChain, Message.FailedRemoveChain],
  execute: ({ id }) =>
    call(Query.removeChain(id)).pipe(
      Effect.map((chain) => Message.SucceededRemoveChain({ code: chain.code })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedRemoveChain({ detail: error.detail })),
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

const closeRemoveDialog = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.removeDialog),
  write: (model, nextRemoveDialog) =>
    modifyFields(model, { removeDialog: () => nextRemoveDialog }),
  toParentMessage: (message) => Message.GotRemoveDialogMessage({ message }),
  foldOutMessage: foldRemoveDialogOutMessage,
})

// LOAD

const loadQuery = (model: Model, query: ChainsQuery): Update.Return<Model, Message> => ({
  model: modifyFields(model, {
    query: () => query,
    chains: () => AsyncData.Loading(),
  }),
  commands: [FetchChains({ query })],
})

const refresh: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.chains), {
    onNone: () => ({ model }),
    onSome: (chains) => ({
      model: modifyFields(model, { chains: () => chains }),
      commands: [FetchChains({ query: model.query })],
    }),
  })

const sameQuery = (current: ChainsQuery, next: ChainsQuery): boolean =>
  current.search === next.search &&
  current.sort === next.sort &&
  current.order === next.order &&
  current.page === next.page

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the first page of chains is on its way.
 */
export const init = (
  query: ChainsQuery,
  maybeChains: Option.Option<Chains>,
): UpdateReturn =>
  Option.match(maybeChains, {
    onNone: () => loadQuery(initialModel, query),
    onSome: (chains) => ({
      model: modifyFields(initialModel, {
        query: () => query,
        chains: () => chains,
      }),
    }),
  })

/**
 * Tell the page the URL changed. The page owns no route, so it derives its
 * query from the one it is given and returns the fetch that query needs. A
 * click that leaves the query as it was fetches nothing.
 */
export const informRouteChanged = (
  model: Model,
  query: ChainsQuery,
): Update.Return<Model, Message> =>
  sameQuery(model.query, query) ? { model } : loadQuery(model, query)

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedSearch: ({ value }) => ({
      model: modifyFields(model, {
        query: (query) => ({ ...query, search: value }),
      }),
      commands: [interruptSearch(), SearchChains({ search: value })],
    }),

    CompletedSearchChains: () => ({ model }),
    CompletedInterruptSearchChains: () => ({ model }),
    CompletedNavigateChains: () => ({ model }),

    ClickedSort: ({ column }) => {
      const order = model.query.sort === column ? flipped(model.query.order) : 'asc'

      return {
        model,
        commands: [
          NavigateChains({
            url: chainsUrl({ ...model.query, sort: column, order, page: 1 }),
          }),
        ],
      }
    },

    ClickedPage: ({ page }) => ({
      model,
      commands: [NavigateChains({ url: chainsUrl({ ...model.query, page }) })],
    }),

    ClickedRetry: () => refresh(model),

    ClickedNewChain: () =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.none(),
            name: () => FieldValidation.NotValidated({ value: '' }),
            code: () => FieldValidation.NotValidated({ value: '' }),
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        foldEditor(Dialog.Message.RequestedOpen()),
      ]),

    ClickedEditChain: ({ id, name, code }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.some({ id }),
            name: () => FieldValidation.Valid({ value: name }),
            code: () => FieldValidation.Valid({ value: code }),
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        foldEditor(Dialog.Message.RequestedOpen()),
      ]),

    UpdatedChainName: ({ value }) => ({
      model: modifyFields(model, { name: () => validateName(value) }),
    }),

    UpdatedChainCode: ({ value }) => ({
      model: modifyFields(model, { code: () => validateCode(value) }),
    }),

    ClickedSaveChain: () =>
      Option.match(model.editing, {
        onNone: () => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [
            AddChain({ name: model.name.value, code: model.code.value }),
          ],
        }),
        onSome: ({ id }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [
            SaveChain({ id, name: model.name.value, code: model.code.value }),
          ],
        }),
      }),

    SucceededSaveChain: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({ model: modifyFields(model, { isSaving: () => false }) }),
          closeEditor,
          refresh,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedSaveChain: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    ClickedRemoveChain: ({ id, code }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            maybeRemoving: () => Option.some({ id, code }),
          }),
        }),
        foldRemoveDialog(Dialog.Message.RequestedOpen()),
      ]),

    ClickedConfirmRemoveChain: () =>
      Option.match(model.maybeRemoving, {
        onNone: () => ({ model }),
        onSome: ({ id }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [DeleteChain({ id })],
        }),
      }),

    SucceededRemoveChain: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, { maybeRemoving: () => Option.none() }),
          }),
          closeRemoveDialog,
          refresh,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedRemoveChain: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    SettledFetchChains: ({ result }) => ({
      model: modifyFields(model, { chains: AsyncData.settle(result) }),
    }),

    GotEditorMessage: ({ message }) => foldEditor(model, message),
    GotRemoveDialogMessage: ({ message }) => foldRemoveDialog(model, message),
  })
