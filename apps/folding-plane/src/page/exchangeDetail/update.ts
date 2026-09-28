import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Dialog } from '@foldkit/ui'
import { AsyncData, Command, FieldValidation, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type ApiFailure, type ApiOrigin, type CoinMetadata, type CoinPage, type Exchange, type MarketAssignment, Query, call } from '../../api'
import { trimmedOrEmpty } from '../../ui/format'
import { Message, OutMessage } from './message'
import {
  type Seed,
  chainCodeRules,
  initFor,
  isAssignValid,
  isEditValid,
  isLinkValid,
  symbolRules,
} from './model'
import { Model } from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const validateSymbol = FieldValidation.validate(symbolRules)
const validateChainCode = FieldValidation.validate(chainCodeRules)

// NORMALIZE

const normalizeChainName = (value: string): string => {
  const trimmed = value.trim()

  return trimmed === '' ? trimmed : trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1)
}

const normalizeChainCode = (value: string): string => value.trim().toUpperCase()

// PENDING

const upsertPendingToggle = (
  toggles: ReadonlyArray<Model['pendingToggles'][number]>,
  next: Model['pendingToggles'][number],
): ReadonlyArray<Model['pendingToggles'][number]> =>
  [...toggles.filter((toggle) => toggle.linkId !== next.linkId), next]

const removePendingToggle = (
  toggles: ReadonlyArray<Model['pendingToggles'][number]>,
  linkId: number,
): ReadonlyArray<Model['pendingToggles'][number]> =>
  toggles.filter((toggle) => toggle.linkId !== linkId)

// COMMAND

/**
 * The reads behind the page. Each requires the API services rather than
 * providing them, so the browser runs it in a Command against its own origin
 * and the server runs it before it renders. The coin index is one read for
 * every row (`limit: -1`), so a market's coin never costs a request of its own.
 */
export const readExchange = (
  exchangeId: number,
): Effect.Effect<Exchange, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.findExchange(exchangeId)

export const readMarkets = (
  exchangeId: number,
): Effect.Effect<ReadonlyArray<MarketAssignment>, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.listExchangeMarkets(exchangeId)

export const readCoins = (): Effect.Effect<
  CoinPage,
  ApiFailure,
  ApiOrigin | HttpClient.HttpClient
> => Query.coinIndex()

export const readMetadata = (
  coinId: number,
): Effect.Effect<CoinMetadata, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.findCoinMetadata(coinId)

export const FetchExchange = Command.define('FetchExchange', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SettledFetchExchange],
  execute: ({ exchangeId }) =>
    call(readExchange(exchangeId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchExchange({ result })),
    ),
})

export const FetchMarkets = Command.define('FetchMarkets', {
  args: { exchangeId: Schema.Int },
  messages: [Message.SettledFetchMarkets],
  execute: ({ exchangeId }) =>
    call(readMarkets(exchangeId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchMarkets({ result })),
    ),
})

export const FetchCoins = Command.define('FetchCoins', {
  messages: [Message.SettledFetchCoins],
  execute: call(readCoins()).pipe(
    Effect.mapError((error) => error.detail),
    Effect.result,
    Effect.map((result) => Message.SettledFetchCoins({ result })),
  ),
})

export const FetchMetadata = Command.define('FetchMetadata', {
  args: { coinId: Schema.Int },
  messages: [Message.SettledFetchMetadata],
  execute: ({ coinId }) =>
    call(readMetadata(coinId)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchMetadata({ result })),
    ),
})

export const FetchLinkChains = Command.define('FetchLinkChains', {
  args: { search: Schema.String },
  messages: [Message.SettledFetchLinkChains],
  execute: ({ search }) =>
    call(Query.searchChains(search)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchLinkChains({ result })),
    ),
})

export const AssignMarket = Command.define('AssignMarket', {
  args: {
    exchangeId: Schema.Int,
    cryptocurrencyId: Schema.Int,
    exchangeSymbol: Schema.String,
    listed: Schema.Boolean,
    tradeEnabled: Schema.Boolean,
  },
  messages: [Message.SucceededAssign, Message.FailedAssign],
  execute: (input) =>
    call(Query.assignMarket(input)).pipe(
      Effect.map((market) => Message.SucceededAssign({ exchangeSymbol: market.exchangeSymbol })),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedAssign({ detail: error.detail })),
      ),
    ),
})

export const SaveMarket = Command.define('SaveMarket', {
  args: {
    marketId: Schema.Int,
    exchangeId: Schema.Int,
    cryptocurrencyId: Schema.Int,
    exchangeSymbol: Schema.String,
    listed: Schema.Boolean,
    tradeEnabled: Schema.Boolean,
  },
  messages: [Message.SucceededEdit, Message.FailedEdit],
  execute: ({ marketId, ...input }) =>
    call(Query.updateMarket(marketId, input)).pipe(
      Effect.map(() => Message.SucceededEdit()),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedEdit({ detail: error.detail })),
      ),
    ),
})

export const UnassignMarket = Command.define('UnassignMarket', {
  args: { marketId: Schema.Int },
  messages: [Message.SucceededUnassign, Message.FailedUnassign],
  execute: ({ marketId }) =>
    call(Query.unassignMarket(marketId)).pipe(
      Effect.map(() => Message.SucceededUnassign()),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedUnassign({ detail: error.detail })),
      ),
    ),
})

export const CreateChain = Command.define('CreateChain', {
  args: { name: Schema.String, code: Schema.String },
  messages: [Message.CreatedLinkChain, Message.FailedCreateChain],
  execute: ({ name, code }) =>
    call(Query.findOrCreateChain({ name, code })).pipe(
      Effect.map((chain) =>
        Message.CreatedLinkChain({ id: chain.id, code: chain.code, name: chain.name })
      ),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedCreateChain({ detail: error.detail })),
      ),
    ),
})

export const AddChainLink = Command.define('AddChainLink', {
  args: {
    marketId: Schema.Int,
    chainId: Schema.Int,
    exchangeChainName: Schema.NullOr(Schema.String),
    exchangeChainCode: Schema.String,
    withdrawEnabled: Schema.Boolean,
    depositEnabled: Schema.Boolean,
  },
  messages: [Message.SucceededAddLink, Message.FailedAddLink],
  execute: ({ marketId, ...input }) =>
    call(
      Query.addChainLink({
        exchangeCryptocurrencyId: marketId,
        ...input,
      }),
    ).pipe(
      Effect.map((link) =>
        Message.SucceededAddLink({ code: link.exchangeChainCode })
      ),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedAddLink({ detail: error.detail })),
      ),
    ),
})

export const ToggleChainLink = Command.define('ToggleChainLink', {
  args: {
    marketId: Schema.Int,
    chainId: Schema.Int,
    linkId: Schema.Int,
    exchangeChainCode: Schema.String,
    exchangeChainName: Schema.NullOr(Schema.String),
    withdrawEnabled: Schema.Boolean,
    depositEnabled: Schema.Boolean,
  },
  messages: [Message.SucceededToggleLink, Message.FailedToggleLink],
  execute: ({ linkId, marketId, chainId, ...input }) =>
    call(
      Query.updateChainLink(linkId, {
        exchangeCryptocurrencyId: marketId,
        chainId,
        ...input,
      }),
    ).pipe(
      Effect.map(() => Message.SucceededToggleLink()),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedToggleLink({ linkId, detail: error.detail })),
      ),
    ),
})

export const RemoveChainLink = Command.define('RemoveChainLink', {
  args: { linkId: Schema.Int },
  messages: [Message.SucceededUnlink, Message.FailedUnlink],
  execute: ({ linkId }) =>
    call(Query.removeChainLink(linkId)).pipe(
      Effect.map(() => Message.SucceededUnlink()),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedUnlink({ detail: error.detail })),
      ),
    ),
})

// FOLD

const keepModel: Update.Step<Model, Message> = (model) => ({ model })

const foldDialog = (
  read: (model: Model) => Option.Option<Dialog.Model>,
  write: (model: Model, next: Dialog.Model) => Model,
  toParentMessage: (message: Dialog.Message) => Message,
) =>
  Update.foldChild({
    update: Dialog.update,
    read,
    write,
    toParentMessage,
    foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
      Opened: () => keepModel,
      Closed: () => keepModel,
    }),
  })

const openDialog = (
  read: (model: Model) => Option.Option<Dialog.Model>,
  write: (model: Model, next: Dialog.Model) => Model,
  toParentMessage: (message: Dialog.Message) => Message,
) =>
  Update.foldChildStep({
    update: Dialog.open,
    read,
    write,
    toParentMessage,
    foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
      Opened: () => keepModel,
      Closed: () => keepModel,
    }),
  })

const foldAssignDialog = foldDialog(
  (model) => Option.some(model.assignDialog),
  (model, next) => modifyFields(model, { assignDialog: () => next }),
  (message) => Message.GotAssignDialogMessage({ message }),
)

const openAssignDialog = openDialog(
  (model) => Option.some(model.assignDialog),
  (model, next) => modifyFields(model, { assignDialog: () => next }),
  (message) => Message.GotAssignDialogMessage({ message }),
)

const foldEditDialog = foldDialog(
  (model) => Option.some(model.editDialog),
  (model, next) => modifyFields(model, { editDialog: () => next }),
  (message) => Message.GotEditDialogMessage({ message }),
)

const openEditDialog = openDialog(
  (model) => Option.some(model.editDialog),
  (model, next) => modifyFields(model, { editDialog: () => next }),
  (message) => Message.GotEditDialogMessage({ message }),
)

const foldUnassignDialog = foldDialog(
  (model) => Option.some(model.unassignDialog),
  (model, next) => modifyFields(model, { unassignDialog: () => next }),
  (message) => Message.GotUnassignDialogMessage({ message }),
)

const openUnassignDialog = openDialog(
  (model) => Option.some(model.unassignDialog),
  (model, next) => modifyFields(model, { unassignDialog: () => next }),
  (message) => Message.GotUnassignDialogMessage({ message }),
)

const foldLinksDialog = foldDialog(
  (model) => Option.some(model.linksDialog),
  (model, next) => modifyFields(model, { linksDialog: () => next }),
  (message) => Message.GotLinksDialogMessage({ message }),
)

const openLinksDialog = openDialog(
  (model) => Option.some(model.linksDialog),
  (model, next) => modifyFields(model, { linksDialog: () => next }),
  (message) => Message.GotLinksDialogMessage({ message }),
)

const foldUnlinkDialog = foldDialog(
  (model) => Option.some(model.unlinkDialog),
  (model, next) => modifyFields(model, { unlinkDialog: () => next }),
  (message) => Message.GotUnlinkDialogMessage({ message }),
)

const openUnlinkDialog = openDialog(
  (model) => Option.some(model.unlinkDialog),
  (model, next) => modifyFields(model, { unlinkDialog: () => next }),
  (message) => Message.GotUnlinkDialogMessage({ message }),
)

const closeAssign = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.assignDialog),
  write: (model, next) => modifyFields(model, { assignDialog: () => next }),
  toParentMessage: (message) => Message.GotAssignDialogMessage({ message }),
  foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => keepModel,
    Closed: () => keepModel,
  }),
})

const closeEdit = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.editDialog),
  write: (model, next) => modifyFields(model, { editDialog: () => next }),
  toParentMessage: (message) => Message.GotEditDialogMessage({ message }),
  foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => keepModel,
    Closed: () => keepModel,
  }),
})

const closeUnassign = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.unassignDialog),
  write: (model, next) => modifyFields(model, { unassignDialog: () => next }),
  toParentMessage: (message) => Message.GotUnassignDialogMessage({ message }),
  foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => keepModel,
    Closed: () => keepModel,
  }),
})

const closeUnlink = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.unlinkDialog),
  write: (model, next) => modifyFields(model, { unlinkDialog: () => next }),
  toParentMessage: (message) => Message.GotUnlinkDialogMessage({ message }),
  foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => keepModel,
    Closed: () => keepModel,
  }),
})

// LOAD

const loadAll = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, {
    exchange: () => AsyncData.Loading(),
    markets: () => AsyncData.Loading(),
    coins: () => AsyncData.Loading(),
  }),
  commands: [
    FetchExchange({ exchangeId: model.exchangeId }),
    FetchMarkets({ exchangeId: model.exchangeId }),
    FetchCoins(),
  ],
})

const refreshExchange: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.exchange), {
    onNone: () => ({ model }),
    onSome: (exchange) => ({
      model: modifyFields(model, { exchange: () => exchange }),
      commands: [FetchExchange({ exchangeId: model.exchangeId })],
    }),
  })

const refreshMarkets: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.markets), {
    onNone: () => ({ model }),
    onSome: (markets) => ({
      model: modifyFields(model, { markets: () => markets }),
      commands: [FetchMarkets({ exchangeId: model.exchangeId })],
    }),
  })

const refreshCoins: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.coins), {
    onNone: () => ({ model }),
    onSome: (coins) => ({
      model: modifyFields(model, { coins: () => coins }),
      commands: [FetchCoins()],
    }),
  })

/**
 * Re-read the managed coin's metadata while its links dialog is open. The
 * coin id comes from the market the operator is managing, so a refresh never
 * asks for a different coin's links.
 */
const refreshManagedMetadata: Update.Step<Model, Message> = (model) =>
  Option.match(model.managing, {
    onNone: () => ({ model }),
    onSome: ({ cryptocurrencyId }) =>
      Option.match(AsyncData.revalidateOrLoad(model.metadata), {
        onNone: () => ({ model }),
        onSome: (metadata) => ({
          model: modifyFields(model, { metadata: () => metadata }),
          commands: [FetchMetadata({ coinId: cryptocurrencyId })],
        }),
      }),
  })

// INIT

/**
 * The page as it opens. The server hands over the rows it already rendered;
 * without them the exchange, its markets, and the coin index are on their way.
 */
export const init = (
  exchangeId: number,
  maybeSeed: Option.Option<Seed>,
): Update.ReturnWithOutMessage<Model, Message, OutMessage> =>
  Option.match(maybeSeed, {
    onNone: () => loadAll(initFor(exchangeId)),
    onSome: (seed) => ({
      model: {
        ...initFor(exchangeId),
        exchange: seed.exchange,
        markets: seed.markets,
        coins: seed.coins,
      },
    }),
  })

/**
 * Tell the page the URL named it. A different exchange starts over; the same
 * one keeps what it holds, fetching only what never loaded, so navigating
 * away and back does not refetch it.
 */
export const showExchange = (
  model: Model,
  exchangeId: number,
): Update.Return<Model, Message> =>
  model.exchangeId !== exchangeId
    ? loadAll(initFor(exchangeId))
    : Update.combine(model, [
      (current) =>
        AsyncData.isIdle(current.exchange) ? refreshExchange(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.markets) ? refreshMarkets(current) : { model: current },
      (current) =>
        AsyncData.isIdle(current.coins) ? refreshCoins(current) : { model: current },
    ])

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedRetry: () =>
      Update.combine(model, [refreshExchange, refreshMarkets, refreshCoins]),

    SettledFetchExchange: ({ result }) => ({
      model: modifyFields(model, { exchange: AsyncData.settle(result) }),
    }),

    SettledFetchMarkets: ({ result }) => ({
      model: modifyFields(model, { markets: AsyncData.settle(result) }),
    }),

    SettledFetchCoins: ({ result }) => ({
      model: modifyFields(model, { coins: AsyncData.settle(result) }),
    }),

    SettledFetchMetadata: ({ result }) => ({
      model: modifyFields(model, {
        metadata: AsyncData.settle(result),
        pendingToggles: () => [],
      }),
    }),

    // Assign

    ClickedAssignMarket: () =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            assignSearch: () => '',
            assignCoin: () => Option.none(),
            assignSymbol: () => FieldValidation.NotValidated({ value: '' }),
            assignListed: () => true,
            assignTradeEnabled: () => true,
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openAssignDialog,
      ]),

    UpdatedAssignSearch: ({ value }) => ({
      model: modifyFields(model, { assignSearch: () => value }),
    }),

    PickedAssignCoin: ({ id, name, symbol }) => ({
      model: modifyFields(model, {
        assignCoin: () => Option.some({ id, name, symbol }),
      }),
    }),

    UpdatedAssignSymbol: ({ value }) => ({
      model: modifyFields(model, { assignSymbol: () => validateSymbol(value) }),
    }),

    ToggledAssignListed: ({ isChecked }) => ({
      model: modifyFields(model, { assignListed: () => isChecked }),
    }),

    ToggledAssignTradeEnabled: ({ isChecked }) => ({
      model: modifyFields(model, { assignTradeEnabled: () => isChecked }),
    }),

    ClickedConfirmAssign: () => {
      const exchangeSymbol = trimmedOrEmpty(model.assignSymbol.value)
      const validated = modifyFields(model, {
        assignSymbol: () => validateSymbol(exchangeSymbol),
      })

      if (!isAssignValid(validated)) {
        return { model: modifyFields(validated, { isSaving: () => false }) }
      }

      return Option.match(validated.assignCoin, {
        onNone: () => ({ model: validated }),
        onSome: ({ id }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [
            AssignMarket({
              exchangeId: validated.exchangeId,
              cryptocurrencyId: id,
              exchangeSymbol,
              listed: validated.assignListed,
              tradeEnabled: validated.assignTradeEnabled,
            }),
          ],
        }),
      })
    },

    SucceededAssign: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({ model: modifyFields(model, { isSaving: () => false }) }),
          closeAssign,
          refreshMarkets,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedAssign: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    // Edit

    ClickedEditMarket: ({ marketId, cryptocurrencyId, label, symbol, listed, tradeEnabled }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.some({ marketId, cryptocurrencyId, label, symbol }),
            editSymbol: () => FieldValidation.Valid({ value: symbol }),
            editListed: () => listed,
            editTradeEnabled: () => tradeEnabled,
            notice: () => Option.none(),
            isSaving: () => false,
          }),
        }),
        openEditDialog,
      ]),

    UpdatedEditSymbol: ({ value }) => ({
      model: modifyFields(model, { editSymbol: () => validateSymbol(value) }),
    }),

    ToggledEditListed: ({ isChecked }) => ({
      model: modifyFields(model, { editListed: () => isChecked }),
    }),

    ToggledEditTradeEnabled: ({ isChecked }) => ({
      model: modifyFields(model, { editTradeEnabled: () => isChecked }),
    }),

    ClickedConfirmEdit: () => {
      const exchangeSymbol = trimmedOrEmpty(model.editSymbol.value)
      const validated = modifyFields(model, {
        editSymbol: () => validateSymbol(exchangeSymbol),
      })

      if (!isEditValid(validated)) {
        return { model: modifyFields(validated, { isSaving: () => false }) }
      }

      return Option.match(validated.editing, {
        onNone: () => ({ model: validated }),
        onSome: ({ marketId, cryptocurrencyId }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [
            SaveMarket({
              marketId,
              exchangeId: validated.exchangeId,
              cryptocurrencyId,
              exchangeSymbol,
              listed: validated.editListed,
              tradeEnabled: validated.editTradeEnabled,
            }),
          ],
        }),
      })
    },

    SucceededEdit: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, {
              editing: () => Option.none(),
              isSaving: () => false,
            }),
          }),
          closeEdit,
          refreshMarkets,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedEdit: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    // Unassign

    ClickedUnassignMarket: ({ marketId, cryptocurrencyId, label, symbol }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            unassigning: () => Option.some({ marketId, cryptocurrencyId, label, symbol }),
            isSaving: () => false,
          }),
        }),
        openUnassignDialog,
      ]),

    ClickedConfirmUnassign: () =>
      Option.match(model.unassigning, {
        onNone: () => ({ model }),
        onSome: ({ marketId }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [UnassignMarket({ marketId })],
        }),
      }),

    SucceededUnassign: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, {
              unassigning: () => Option.none(),
              isSaving: () => false,
            }),
          }),
          closeUnassign,
          refreshMarkets,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedUnassign: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        notice: () => Option.some(detail),
      }),
    }),

    // Chain links

    ClickedManageLinks: ({ marketId, cryptocurrencyId, label, symbol }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            managing: () => Option.some({ marketId, cryptocurrencyId, label, symbol }),
            metadata: () => AsyncData.Loading(),
            linkSearch: () => '',
            linkChains: () => AsyncData.Loading(),
            linkChain: () => Option.none(),
            linkCode: () => FieldValidation.NotValidated({ value: '' }),
            linkWithdraw: () => true,
            linkDeposit: () => true,
            removingLink: () => Option.none(),
            linksNotice: () => Option.none(),
            isSaving: () => false,
          }),
          commands: [
            FetchMetadata({ coinId: cryptocurrencyId }),
            FetchLinkChains({ search: '' }),
          ],
        }),
        openLinksDialog,
      ]),

    UpdatedLinkSearch: ({ value }) => ({
      model: modifyFields(model, {
        linkSearch: () => value,
        linkChains: () => AsyncData.Loading(),
        linkChain: () => Option.none(),
      }),
      commands: [FetchLinkChains({ search: value })],
    }),

    SettledFetchLinkChains: ({ result }) => ({
      model: modifyFields(model, { linkChains: AsyncData.settle(result) }),
    }),

    PickedLinkChain: ({ id, code, name }) => ({
      model: modifyFields(model, {
        linkChain: () => Option.some({ id, code, name }),
      }),
    }),

    ClickedCreateChain: () => {
      const search = trimmedOrEmpty(model.linkSearch)

      return search === ''
        ? { model }
        : {
          model: modifyFields(model, { isSaving: () => true }),
          commands: [
            CreateChain({
              name: normalizeChainName(search),
              code: normalizeChainCode(search),
            }),
          ],
        }
    },

    CreatedLinkChain: ({ id, code, name }) => ({
      model: modifyFields(model, {
        linkChain: () => Option.some({ id, code, name }),
        linkChains: () => AsyncData.Loading(),
        isSaving: () => false,
      }),
      commands: [FetchLinkChains({ search: model.linkSearch })],
    }),

    FailedCreateChain: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        linksNotice: () => Option.some(detail),
      }),
    }),

    UpdatedLinkCode: ({ value }) => ({
      model: modifyFields(model, { linkCode: () => validateChainCode(value) }),
    }),

    ToggledLinkWithdraw: ({ isChecked }) => ({
      model: modifyFields(model, { linkWithdraw: () => isChecked }),
    }),

    ToggledLinkDeposit: ({ isChecked }) => ({
      model: modifyFields(model, { linkDeposit: () => isChecked }),
    }),

    ClickedAddLink: () => {
      const exchangeChainCode = trimmedOrEmpty(model.linkCode.value)
      const validated = modifyFields(model, {
        linkCode: () => validateChainCode(exchangeChainCode),
      })

      if (!isLinkValid(validated)) {
        return { model: modifyFields(validated, { isSaving: () => false }) }
      }

      return Option.match(validated.managing, {
        onNone: () => ({ model: validated }),
        onSome: ({ marketId }) =>
          Option.match(validated.linkChain, {
            onNone: () => ({ model: validated }),
            onSome: ({ id, name }) => ({
              model: modifyFields(validated, { isSaving: () => true }),
              commands: [
                AddChainLink({
                  marketId,
                  chainId: id,
                  exchangeChainName: name,
                  exchangeChainCode,
                  withdrawEnabled: validated.linkWithdraw,
                  depositEnabled: validated.linkDeposit,
                }),
              ],
            }),
          }),
      })
    },

    SucceededAddLink: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, {
              linkChain: () => Option.none(),
              linkCode: () => FieldValidation.NotValidated({ value: '' }),
              linkWithdraw: () => true,
              linkDeposit: () => true,
              isSaving: () => false,
            }),
          }),
          refreshManagedMetadata,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedAddLink: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        linksNotice: () => Option.some(detail),
      }),
    }),

    ClickedToggleLink: ({ marketId, chainId, linkId, withdrawEnabled, depositEnabled, exchangeChainCode, exchangeChainName }) => ({
      model: modifyFields(model, {
        pendingToggles: (toggles) =>
          upsertPendingToggle(toggles, { linkId, withdrawEnabled, depositEnabled }),
      }),
      commands: [
        ToggleChainLink({ marketId, chainId, linkId, withdrawEnabled, depositEnabled, exchangeChainCode, exchangeChainName }),
      ],
    }),

    SucceededToggleLink: () =>
      Update.withOutMessage(refreshManagedMetadata(model), OutMessage.ChangedCatalogue()),

    FailedToggleLink: ({ linkId, detail }) => ({
      model: modifyFields(model, {
        pendingToggles: (toggles) => removePendingToggle(toggles, linkId),
        linksNotice: () => Option.some(detail),
      }),
    }),

    ClickedUnlinkChain: ({ linkId, code }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            removingLink: () => Option.some({ linkId, code }),
          }),
        }),
        openUnlinkDialog,
      ]),

    ClickedConfirmUnlink: () =>
      Option.match(model.removingLink, {
        onNone: () => ({ model }),
        onSome: ({ linkId }) => ({
          model: modifyFields(model, { isSaving: () => true }),
          commands: [RemoveChainLink({ linkId })],
        }),
      }),

    SucceededUnlink: () =>
      Update.withOutMessage(
        Update.combine(model, [
          () => ({
            model: modifyFields(model, {
              removingLink: () => Option.none(),
              isSaving: () => false,
            }),
          }),
          closeUnlink,
          refreshManagedMetadata,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedUnlink: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        linksNotice: () => Option.some(detail),
      }),
    }),

    GotAssignDialogMessage: ({ message }) => foldAssignDialog(model, message),
    GotEditDialogMessage: ({ message }) => foldEditDialog(model, message),
    GotUnassignDialogMessage: ({ message }) => foldUnassignDialog(model, message),
    GotLinksDialogMessage: ({ message }) => foldLinksDialog(model, message),
    GotUnlinkDialogMessage: ({ message }) => foldUnlinkDialog(model, message),
  })
