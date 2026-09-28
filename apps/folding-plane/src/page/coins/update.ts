import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Dialog } from '@foldkit/ui'
import { AsyncData, Command, FieldValidation, Update } from 'foldkit'
import { pushUrl, replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type CoinStatPage, Query, call } from '../../api'
import { CoinsQuery, type Order, coinsUrl } from '../../route'
import { trimmedOrEmpty } from '../../ui/format'
import { searchDelay } from '../../ui/search'
import { Message, OutMessage } from './message'
import {
  type Coins,
  Model,
  coingeckoIdRules,
  initialModel,
  isFormValid,
  logoRules,
  nameRules,
  slugRules,
  symbolRules,
} from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const validateSymbol = FieldValidation.validate(symbolRules)
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
export const SearchCoins = Command.define('SearchCoins', {
  args: { query: CoinsQuery },
  messages: [Message.CompletedSearchCoins, Message.CompletedInterruptSearchCoins],
  interrupt: true,
  execute: ({ query }) =>
    Effect.sleep(searchDelay).pipe(
      Effect.andThen(replaceUrl(coinsUrl(query))),
      Effect.as(Message.CompletedSearchCoins()),
      Effect.catch(() => Effect.succeed(Message.CompletedSearchCoins())),
    ),
})

const interruptSearch = () =>
  SearchCoins.Interrupt((outcome) =>
    Message.CompletedInterruptSearchCoins({ outcome }))

/**
 * A change of sort, page, or filter. It is a navigation rather than a local
 * transition, so the URL always describes the table on screen.
 */
export const NavigateCoins = Command.define('NavigateCoins', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateCoins],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateCoins())),
})

/**
 * The read behind the listing. It requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders.
 */
export const readCoins = (
  query: CoinsQuery,
): Effect.Effect<CoinStatPage, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.fetchCoinStats({
    limit: query.limit,
    page: query.page,
    search: query.search,
    searchBy: query.searchBy,
    flag: query.flag,
    sortBy: query.sort,
    order: query.order,
    exchangeId: Option.getOrUndefined(query.exchangeId),
    chainId: Option.getOrUndefined(query.chainId),
  })

export const FetchCoins = Command.define('FetchCoins', {
  args: { query: CoinsQuery },
  messages: [Message.SettledFetchCoins],
  execute: ({ query }) =>
    call(readCoins(query)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchCoins({ result })),
    ),
})

export const AddCoin = Command.define('AddCoin', {
  args: {
    name: Schema.String,
    symbol: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
    logo: Schema.String,
  },
  messages: [Message.SucceededSaveCoin, Message.FailedSaveCoin],
  execute: (input) =>
    call(Query.addCoin(input)).pipe(
      Effect.map((coin) => Message.SucceededSaveCoin({ symbol: coin.symbol })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveCoin({ detail: error.detail })),
      ),
    ),
})

export const SaveCoin = Command.define('SaveCoin', {
  args: {
    id: Schema.Int,
    name: Schema.String,
    symbol: Schema.String,
    slug: Schema.String,
    coingeckoId: Schema.String,
  },
  messages: [Message.SucceededSaveCoin, Message.FailedSaveCoin],
  execute: ({ id, ...input }) =>
    call(Query.updateCoin(id, input)).pipe(
      Effect.map((coin) => Message.SucceededSaveCoin({ symbol: coin.symbol })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedSaveCoin({ detail: error.detail })),
      ),
    ),
})

export const DeleteCoin = Command.define('DeleteCoin', {
  args: { id: Schema.Int },
  messages: [Message.SucceededRemoveCoin, Message.FailedRemoveCoin],
  execute: ({ id }) =>
    call(Query.removeCoin(id)).pipe(
      Effect.map((coin) => Message.SucceededRemoveCoin({ symbol: coin.symbol })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedRemoveCoin({ detail: error.detail })),
      ),
    ),
})

/**
 * The two reads behind the scope picker. Opening it loads the first window of
 * whichever directory the operator is choosing from; typing narrows it.
 */
export const FetchScopeExchanges = Command.define('FetchScopeExchanges', {
  args: { search: Schema.String },
  messages: [Message.SettledFetchScopeExchanges],
  execute: ({ search }) =>
    call(Query.searchExchanges(search)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchScopeExchanges({ result })),
    ),
})

export const FetchScopeChains = Command.define('FetchScopeChains', {
  args: { search: Schema.String },
  messages: [Message.SettledFetchScopeChains],
  execute: ({ search }) =>
    call(Query.searchChains(search)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchScopeChains({ result })),
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

const foldScopeDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => keepModel,
  Closed: () => keepModel,
})

const foldScopeDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.scopeDialog),
  write: (model, nextScopeDialog) =>
    modifyFields(model, { scopeDialog: () => nextScopeDialog }),
  toParentMessage: (message) => Message.GotScopeDialogMessage({ message }),
  foldOutMessage: foldScopeDialogOutMessage,
})

const openScopeDialog = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.scopeDialog),
  write: (model, nextScopeDialog) =>
    modifyFields(model, { scopeDialog: () => nextScopeDialog }),
  toParentMessage: (message) => Message.GotScopeDialogMessage({ message }),
  foldOutMessage: foldScopeDialogOutMessage,
})

const closeScopeDialog = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.scopeDialog),
  write: (model, nextScopeDialog) =>
    modifyFields(model, { scopeDialog: () => nextScopeDialog }),
  toParentMessage: (message) => Message.GotScopeDialogMessage({ message }),
  foldOutMessage: foldScopeDialogOutMessage,
})

// LOAD

const loadQuery = (model: Model, query: CoinsQuery): Update.Return<Model, Message> => ({
  model: modifyFields(model, {
    query: () => query,
    loadedQuery: () => Option.some(query),
    coins: () => AsyncData.Loading(),
  }),
  commands: [FetchCoins({ query })],
})

const refresh: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.coins), {
    onNone: () => ({ model }),
    onSome: (coins) => ({
      model: modifyFields(model, { coins: () => coins }),
      commands: [FetchCoins({ query: model.query })],
    }),
  })

const sameQuery = (current: CoinsQuery, next: CoinsQuery): boolean =>
  current.search === next.search &&
  current.searchBy.join(',') === next.searchBy.join(',') &&
  current.flag === next.flag &&
  current.sort === next.sort &&
  current.order === next.order &&
  current.limit === next.limit &&
  Option.getOrUndefined(current.exchangeId) === Option.getOrUndefined(next.exchangeId) &&
  Option.getOrUndefined(current.chainId) === Option.getOrUndefined(next.chainId) &&
  current.page === next.page

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the first page of coins is on its way.
 */
export const init = (
  query: CoinsQuery,
  maybeCoins: Option.Option<Coins>,
): UpdateReturn =>
  Option.match(maybeCoins, {
    onNone: () => loadQuery(initialModel, query),
    onSome: (coins) => ({
      model: modifyFields(initialModel, {
        query: () => query,
        loadedQuery: () => Option.some(query),
        coins: () => coins,
      }),
    }),
  })

/**
 * Tell the page the URL changed. The page owns no route, so it derives its
 * query from the one it is given and returns the fetch that query needs. A
 * click that leaves the last loaded query as it was fetches nothing, while a
 * search whose debounced navigation lands on a query the page has not read
 * still issues its read.
 */
export const informRouteChanged = (
  model: Model,
  query: CoinsQuery,
): Update.Return<Model, Message> =>
  Option.match(model.loadedQuery, {
    onNone: () => loadQuery(model, query),
    onSome: (loaded) => (sameQuery(loaded, query) ? { model } : loadQuery(model, query)),
  })

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedSearch: ({ value }) => {
      const query = modifyFields(model.query, {
        search: () => value,
        page: () => 1,
      })

      return {
        model: modifyFields(model, { query: () => query }),
        commands: [interruptSearch(), SearchCoins({ query })],
      }
    },

    CompletedSearchCoins: () => ({ model }),
    CompletedInterruptSearchCoins: () => ({ model }),
    CompletedNavigateCoins: () => ({ model }),

    ClickedSort: ({ column }) => {
      const order = model.query.sort === column ? flipped(model.query.order) : 'asc'

      return {
        model,
        commands: [
          NavigateCoins({
            url: coinsUrl({ ...model.query, sort: column, order, page: 1 }),
          }),
        ],
      }
    },

    ChangedFlag: ({ flag }) => ({
      model,
      commands: [
        NavigateCoins({
          url: coinsUrl({ ...model.query, flag, page: 1 }),
        }),
      ],
    }),

    ChangedPageSize: ({ value }) => ({
      model,
      commands: [
        NavigateCoins({
          url: coinsUrl({ ...model.query, limit: value, page: 1 }),
        }),
      ],
    }),

    ToggledSearchField: ({ field, isChecked }) => {
      const next = isChecked
        ? model.query.searchBy.includes(field)
          ? model.query.searchBy
          : [...model.query.searchBy, field]
        : model.query.searchBy.filter((candidate) => candidate !== field)

      return next.length === 0
        ? { model }
        : {
          model,
          commands: [
            NavigateCoins({
              url: coinsUrl({ ...model.query, searchBy: next, page: 1 }),
            }),
          ],
        }
    },

    ClickedScope: () =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            scopeKind: () => 'exchange' as const,
            scopeSearch: () => '',
            scopeExchanges: () => AsyncData.Loading(),
          }),
          commands: [FetchScopeExchanges({ search: '' })],
        }),
        openScopeDialog,
      ]),

    ChangedScopeKind: ({ kind }) => ({
      model: modifyFields(model, {
        scopeKind: () => kind,
        scopeSearch: () => '',
        scopeExchanges: () => (kind === 'exchange' ? AsyncData.Loading() : model.scopeExchanges),
        scopeChains: () => (kind === 'chain' ? AsyncData.Loading() : model.scopeChains),
      }),
      commands: kind === 'exchange'
        ? [FetchScopeExchanges({ search: '' })]
        : [FetchScopeChains({ search: '' })],
    }),

    UpdatedScopeSearch: ({ value }) => ({
      model: modifyFields(model, { scopeSearch: () => value }),
      commands: [
        model.scopeKind === 'exchange'
          ? FetchScopeExchanges({ search: value })
          : FetchScopeChains({ search: value }),
      ],
    }),

    SettledFetchScopeExchanges: ({ result }) => ({
      model: modifyFields(model, { scopeExchanges: AsyncData.settle(result) }),
    }),

    SettledFetchScopeChains: ({ result }) => ({
      model: modifyFields(model, { scopeChains: AsyncData.settle(result) }),
    }),

    PickedScopeExchange: ({ id }) =>
      Update.combine(model, [
        () => ({
          model,
          commands: [
            NavigateCoins({
              url: coinsUrl({
                ...model.query,
                exchangeId: Option.some(id),
                chainId: Option.none(),
                page: 1,
              }),
            }),
          ],
        }),
        closeScopeDialog,
      ]),

    PickedScopeChain: ({ id }) =>
      Update.combine(model, [
        () => ({
          model,
          commands: [
            NavigateCoins({
              url: coinsUrl({
                ...model.query,
                exchangeId: Option.none(),
                chainId: Option.some(id),
                page: 1,
              }),
            }),
          ],
        }),
        closeScopeDialog,
      ]),

    ClickedClearScope: () => ({
      model,
      commands: [
        NavigateCoins({
          url: coinsUrl({
            ...model.query,
            exchangeId: Option.none(),
            chainId: Option.none(),
            page: 1,
          }),
        }),
      ],
    }),

    ClickedRetry: () => refresh(model),

    ClickedNewCoin: () =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.none(),
            symbol: () => FieldValidation.NotValidated({ value: '' }),
            name: () => FieldValidation.NotValidated({ value: '' }),
            slug: () => FieldValidation.NotValidated({ value: '' }),
            coingeckoId: () => FieldValidation.NotValidated({ value: '' }),
            logo: () => FieldValidation.NotValidated({ value: '' }),
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openEditor,
      ]),

    ClickedEditCoin: ({ id, name, symbol, slug, coingeckoId, logo }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.some({ id }),
            symbol: () => FieldValidation.Valid({ value: symbol }),
            name: () => FieldValidation.Valid({ value: name }),
            slug: () => FieldValidation.Valid({ value: slug }),
            coingeckoId: () => FieldValidation.Valid({ value: coingeckoId }),
            logo: () => validateLogo(logo),
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openEditor,
      ]),

    UpdatedCoinSymbol: ({ value }) => ({
      model: modifyFields(model, { symbol: () => validateSymbol(value) }),
    }),

    UpdatedCoinName: ({ value }) => ({
      model: modifyFields(model, { name: () => validateName(value) }),
    }),

    UpdatedCoinSlug: ({ value }) => ({
      model: modifyFields(model, { slug: () => validateSlug(value) }),
    }),

    UpdatedCoinCoingeckoId: ({ value }) => ({
      model: modifyFields(model, { coingeckoId: () => validateCoingeckoId(value) }),
    }),

    UpdatedCoinLogo: ({ value }) => ({
      model: modifyFields(model, { logo: () => validateLogo(value) }),
    }),

    ClickedSaveCoin: () => {
      const symbol = trimmedOrEmpty(model.symbol.value)
      const name = trimmedOrEmpty(model.name.value)
      const slug = trimmedOrEmpty(model.slug.value)
      const coingeckoId = trimmedOrEmpty(model.coingeckoId.value)
      const logo = trimmedOrEmpty(model.logo.value)
      const validated = modifyFields(model, {
        symbol: () => validateSymbol(symbol),
        name: () => validateName(name),
        slug: () => validateSlug(slug),
        coingeckoId: () => validateCoingeckoId(coingeckoId),
        logo: () => validateLogo(logo),
      })

      if (!isFormValid(validated)) {
        return { model: modifyFields(validated, { isSaving: () => false }) }
      }

      return Option.match(model.editing, {
        onNone: () => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [AddCoin({ name, symbol, slug, coingeckoId, logo })],
        }),
        onSome: ({ id }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [SaveCoin({ id, name, symbol, slug, coingeckoId })],
        }),
      })
    },

    SucceededSaveCoin: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({ model: modifyFields(model, { isSaving: () => false }) }),
          closeEditor,
          refresh,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedSaveCoin: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    ClickedRemoveCoin: ({ id, symbol }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            maybeRemoving: () => Option.some({ id, symbol }),
          }),
        }),
        openRemoveDialog,
      ]),

    ClickedConfirmRemoveCoin: () =>
      Option.match(model.maybeRemoving, {
        onNone: () => ({ model }),
        onSome: ({ id }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [DeleteCoin({ id })],
        }),
      }),

    SucceededRemoveCoin: () =>
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

    FailedRemoveCoin: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    SettledFetchCoins: ({ result }) => ({
      model: modifyFields(model, { coins: AsyncData.settle(result) }),
    }),

    GotEditorMessage: ({ message }) => foldEditor(model, message),
    GotScopeDialogMessage: ({ message }) => foldScopeDialog(model, message),
    GotRemoveDialogMessage: ({ message }) => foldRemoveDialog(model, message),
  })
