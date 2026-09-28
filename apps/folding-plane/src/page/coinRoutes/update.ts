import { Effect, Option, Schema } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Dialog } from '@foldkit/ui'
import { AsyncData, Command, FieldValidation, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { orderedPairStatus, viableChains } from '@lister/domain'

import { type ApiFailure, type ApiOrigin, type CoinMetadata, Query, call } from '../../api'
import { trimmedOrEmpty } from '../../ui/format'
import { Message, OutMessage } from './message'
import {
  Model,
  type Seed,
  chainCodeRules,
  initFor,
  isAssignValid,
  isEditValid,
  isLinkValid,
  symbolRules,
} from './model'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const validateSymbol = FieldValidation.validate(symbolRules)
const validateChainCode = FieldValidation.validate(chainCodeRules)

// MATRIX

type MarketFlags = Readonly<{ chainId: number, withdrawEnabled: boolean, depositEnabled: boolean }>

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

const flagsOf = (
  metadata: CoinMetadata,
  marketId: number,
): ReadonlyArray<MarketFlags> => {
  const market = metadata.exchanges.find((candidate) => candidate.marketId === marketId)

  if (market === undefined) {
    return []
  }

  return market.chains.map((chain) => ({
    chainId: chain.id,
    withdrawEnabled: chain.withdrawEnabled,
    depositEnabled: chain.depositEnabled,
  }))
}

/**
 * The ordered status of one directed pair, derived from the metadata the API
 * already returns. No endpoint is added and nothing is stored.
 */
export const statusOf = (
  metadata: CoinMetadata,
  fromId: number,
  toId: number,
): ReturnType<typeof orderedPairStatus> =>
  orderedPairStatus(flagsOf(metadata, fromId), flagsOf(metadata, toId))

/**
 * The chains that carry value in one direction, by id.
 */
export const viableFor = (
  metadata: CoinMetadata,
  fromId: number,
  toId: number,
): ReadonlyArray<number> =>
  viableChains(flagsOf(metadata, fromId), flagsOf(metadata, toId))

export const statusLabel = (status: ReturnType<typeof orderedPairStatus>): string => {
  switch (status) {
    case 'full':
      return 'full'
    case 'one-way-blocked':
    case 'one-way-other':
      return 'one-way'
    case 'none':
      return 'blocked'
  }
}

// COMMAND

export const readMetadata = (
  coinId: number,
): Effect.Effect<CoinMetadata, ApiFailure, ApiOrigin | HttpClient.HttpClient> =>
  Query.findCoinMetadata(coinId)

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

export const FetchAssignExchanges = Command.define('FetchAssignExchanges', {
  args: { search: Schema.String },
  messages: [Message.SettledFetchAssignExchanges],
  execute: ({ search }) =>
    call(Query.searchExchanges(search)).pipe(
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchAssignExchanges({ result })),
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

const foldRouteDialog = foldDialog(
  (model) => Option.some(model.routeDialog),
  (model, next) => modifyFields(model, { routeDialog: () => next }),
  (message) => Message.GotRouteDialogMessage({ message }),
)

const openRouteDialog = openDialog(
  (model) => Option.some(model.routeDialog),
  (model, next) => modifyFields(model, { routeDialog: () => next }),
  (message) => Message.GotRouteDialogMessage({ message }),
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

// LOAD

const loadAll = (model: Model): Update.Return<Model, Message> => ({
  model: modifyFields(model, { metadata: () => AsyncData.Loading() }),
  commands: [FetchMetadata({ coinId: model.coinId })],
})

const refreshMetadata: Update.Step<Model, Message> = (model) =>
  Option.match(AsyncData.revalidateOrLoad(model.metadata), {
    onNone: () => ({ model }),
    onSome: (metadata) => ({
      model: modifyFields(model, { metadata: () => metadata }),
      commands: [FetchMetadata({ coinId: model.coinId })],
    }),
  })

// INIT

export const init = (
  coinId: number,
  maybeSeed: Option.Option<Seed>,
): UpdateReturn =>
  Option.match(maybeSeed, {
    onNone: () => loadAll(initFor(coinId)),
    onSome: (seed) => ({
      model: { ...initFor(coinId), metadata: seed.metadata },
    }),
  })

export const showCoin = (
  model: Model,
  coinId: number,
): Update.Return<Model, Message> =>
  model.coinId !== coinId
    ? loadAll(initFor(coinId))
    : AsyncData.isIdle(model.metadata)
      ? loadAll(model)
      : { model }

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedRetry: () => refreshMetadata(model),

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
            assignExchanges: () => AsyncData.Loading(),
            assignExchange: () => Option.none(),
            assignSymbol: () => FieldValidation.NotValidated({ value: '' }),
            assignListed: () => true,
            assignTradeEnabled: () => true,
            notice: () => Option.none(),
            isSaving: () => false,
          }),
          commands: [FetchAssignExchanges({ search: '' })],
        }),
        openAssignDialog,
      ]),

    UpdatedAssignSearch: ({ value }) => ({
      model: modifyFields(model, {
        assignSearch: () => value,
        assignExchanges: () => AsyncData.Loading(),
      }),
      commands: [FetchAssignExchanges({ search: value })],
    }),

    SettledFetchAssignExchanges: ({ result }) => ({
      model: modifyFields(model, { assignExchanges: AsyncData.settle(result) }),
    }),

    PickedAssignExchange: ({ id, name, slug }) => ({
      model: modifyFields(model, {
        assignExchange: () => Option.some({ id, name, slug }),
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

      return Option.match(validated.assignExchange, {
        onNone: () => ({ model: validated }),
        onSome: ({ id }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [
            AssignMarket({
              exchangeId: id,
              cryptocurrencyId: validated.coinId,
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
          refreshMetadata,
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

    ClickedEditMarket: ({ marketId, exchangeId, name, symbol, listed, tradeEnabled }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            editing: () => Option.some({ marketId, exchangeId, name, symbol }),
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
        onSome: ({ marketId, exchangeId }) => ({
          model: modifyFields(validated, { isSaving: () => true }),
          commands: [
            SaveMarket({
              marketId,
              exchangeId,
              cryptocurrencyId: validated.coinId,
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
          refreshMetadata,
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

    ClickedUnassignMarket: ({ marketId, exchangeId, name, symbol }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            unassigning: () => Option.some({ marketId, exchangeId, name, symbol }),
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
          refreshMetadata,
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

    ClickedManageLinks: ({ marketId, exchangeId, name, symbol }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            managing: () => Option.some({ marketId, exchangeId, name, symbol }),
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
          commands: [FetchLinkChains({ search: '' })],
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
          refreshMetadata,
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
      Update.withOutMessage(refreshMetadata(model), OutMessage.ChangedCatalogue()),

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
          Update.foldChildStep({
            update: Dialog.close,
            read: (current: Model) => Option.some(current.unlinkDialog),
            write: (current, next) => modifyFields(current, { unlinkDialog: () => next }),
            toParentMessage: (message) => Message.GotUnlinkDialogMessage({ message }),
            foldOutMessage: Dialog.OutMessage.match<Update.Step<Model, Message>>({
              Opened: () => keepModel,
              Closed: () => keepModel,
            }),
          }),
          refreshMetadata,
        ]),
        OutMessage.ChangedCatalogue(),
      ),

    FailedUnlink: ({ detail }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        linksNotice: () => Option.some(detail),
      }),
    }),

    // Route detail

    ClickedRouteDetail: ({ fromId, toId }) =>
      Update.combine(model, [
        () => ({
          model: modifyFields(model, {
            routeDetail: () => Option.some({ fromId, toId }),
          }),
        }),
        openRouteDialog,
      ]),

    GotAssignDialogMessage: ({ message }) => foldAssignDialog(model, message),
    GotEditDialogMessage: ({ message }) => foldEditDialog(model, message),
    GotUnassignDialogMessage: ({ message }) => foldUnassignDialog(model, message),
    GotLinksDialogMessage: ({ message }) => foldLinksDialog(model, message),
    GotUnlinkDialogMessage: ({ message }) => foldUnlinkDialog(model, message),
    GotRouteDialogMessage: ({ message }) => foldRouteDialog(model, message),
  })
