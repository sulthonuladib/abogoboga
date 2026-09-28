import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { CryptocurrencyNotFound, type CryptocurrencyMetadata } from "@lister/api/client"
import {
  CryptocurrencyId,
  orderedPairStatus,
  viableChains,
  type Chain as ChainModel,
  type ChainLinkFlags,
  type Exchange as ExchangeModel
} from "@lister/domain"
import { Badge } from "@lister/ui/components/badge"
import { Button } from "@lister/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@lister/ui/components/dialog"
import { Input } from "@lister/ui/components/input"
import { CoinsIcon, LinkSimpleIcon, PencilSimpleIcon, PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { Cause, Option, Schema } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { chainListAtom, coinAtom, coinMetadataAtom, exchangeListAtom } from "../api/atoms.ts"
import { chainLinksKey, chainsKey, marketsKey } from "../api/keys.ts"
import {
  chainLinkMutations,
  chainMutations,
  marketMutations,
  runMutation
} from "../api/mutations.ts"
import { formatCount } from "../lib/format.ts"
import { parseRouteId } from "../lib/ids.ts"
import { ConfirmDialog, FormDialog } from "../ui/Dialogs.tsx"
import { Field } from "../ui/Field.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { EmptyState, ErrorAlert, IconAction, RetryButton } from "../ui/States.tsx"
import { StatStrip } from "../ui/StatStrip.tsx"
import { Body, DataTable, Head, LoadingRows, Row, Td, Th } from "../ui/Table.tsx"
import { LookupSelect, type LookupSource } from "../widgets/LookupSelect.tsx"

type MarketListing = CryptocurrencyMetadata["exchanges"][number]

type ChainListing = MarketListing["chains"][number]

const exchangeLookup: LookupSource<ExchangeModel> = {
  listAtom: (input) =>
    exchangeListAtom({
      limit: 20,
      search: input.search,
      searchBy: ["name", "slug"],
      orderBy: "name",
      cursor: input.cursor
    }),
  toOption: (exchange) => ({ label: exchange.name, title: exchange.name, subtitle: exchange.slug })
}

const chainLookup: LookupSource<ChainModel> = {
  listAtom: (input) =>
    chainListAtom({
      limit: 20,
      search: input.search,
      searchBy: ["name", "code"],
      orderBy: "name",
      cursor: input.cursor
    }),
  toOption: (chain) => ({ label: chain.code, title: chain.code, subtitle: chain.name })
}

const toFlags = (market: MarketListing): ReadonlyArray<ChainLinkFlags> =>
  market.chains.map((chain) => ({
    chainId: chain.id,
    withdrawEnabled: chain.withdrawEnabled,
    depositEnabled: chain.depositEnabled
  }))

const statusLabel = (status: ReturnType<typeof orderedPairStatus>): string => {  switch (status) {
    case "full":
      return "full"
    case "one-way-blocked":
    case "one-way-other":
      return "one-way"
    case "none":
      return "blocked"
  }
}

const statusVariant = (status: ReturnType<typeof orderedPairStatus>): "secondary" | "outline" | "destructive" => {
  switch (status) {
    case "full":
      return "secondary"
    case "none":
      return "destructive"
    case "one-way-blocked":
    case "one-way-other":
      return "outline"
  }
}

/**
 * Chain-link manager for one market assignment. *
 * Adding, toggling, and removing links all invalidate the chain-link
 * reactivity key, so the coin's metadata (and this dialog) refetch live.
 */
const ManageLinksDialog = (props: {
  readonly market: MarketListing | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) => {
  const addLink = useAtomSet(chainLinkMutations.add, { mode: "promiseExit" })
  const updateLink = useAtomSet(chainLinkMutations.update, { mode: "promiseExit" })
  const removeLink = useAtomSet(chainLinkMutations.remove, { mode: "promiseExit" })
  const findOrCreateChain = useAtomSet(chainMutations.findOrCreate, { mode: "promiseExit" })

  const [chain, setChain] = useState<ChainModel | null>(null)
  const [exchangeChainCode, setExchangeChainCode] = useState("")
  const [withdrawEnabled, setWithdrawEnabled] = useState(true)
  const [depositEnabled, setDepositEnabled] = useState(true)
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState<ChainListing | null>(null)

  const market = props.market

  const submit = useCallback(async () => {
    if (market === null || chain === null || exchangeChainCode.trim() === "") return

    setPending(true)

    const added = await runMutation(
      () =>
        addLink({
          payload: {
            exchangeCryptocurrencyId: market.marketId,
            chainId: chain.id,
            exchangeChainCode: exchangeChainCode.trim(),
            exchangeChainName: null,
            withdrawEnabled,
            depositEnabled
          },
          reactivityKeys: [chainLinksKey]
        }),
      { success: `Chain ${chain.code} linked`, failure: "Could not link chain" }
    )

    setPending(false)

    if (added !== undefined) {
      setChain(null)
      setExchangeChainCode("")
      setWithdrawEnabled(true)
      setDepositEnabled(true)
    }
  }, [addLink, chain, depositEnabled, exchangeChainCode, market, withdrawEnabled])

  const toggle = useCallback(
    async (link: ChainListing, field: "withdrawEnabled" | "depositEnabled") => {
      if (market === null) return

      await runMutation(
        () =>
          updateLink({
            params: { id: link.linkId },
            payload: {
              exchangeChainCode: link.exchangeChainCode,
              exchangeCryptocurrencyId: market.marketId,
              chainId: link.id,
              exchangeChainName: link.exchangeChainName,
              withdrawEnabled: field === "withdrawEnabled" ? !link.withdrawEnabled : link.withdrawEnabled,
              depositEnabled: field === "depositEnabled" ? !link.depositEnabled : link.depositEnabled
            },
            reactivityKeys: [chainLinksKey]
          }),
        { success: "Link updated", failure: "Could not update link" }
      )
    },
    [market, updateLink]
  )

  const confirmRemove = useCallback(async () => {
    if (removing === null) return

    setPending(true)

    const removed = await runMutation(
      () => removeLink({ params: { id: removing.linkId }, reactivityKeys: [chainLinksKey] }),
      { success: `Chain ${removing.code} unlinked`, failure: "Could not unlink chain" }
    )

    setPending(false)

    if (removed !== undefined) setRemoving(null)
  }, [removeLink, removing])

  return (
    <>
      <FormDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={market === null ? "Chain links" : `Chains for ${market.name}`}
        description="A route exists between two markets only when one side can withdraw and the other can deposit on the same chain."
        submitLabel="Add chain link"
        pending={pending}
        onSubmit={() => void submit()}
      >
        {market === null || market.chains.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chains linked yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border">
            {market.chains.map((link) => (
              <li key={link.linkId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium uppercase">{link.code}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {link.name} (exchange code {link.exchangeChainCode})
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant={link.withdrawEnabled ? "secondary" : "outline"}
                  aria-pressed={link.withdrawEnabled}
                  onClick={() => void toggle(link, "withdrawEnabled")}
                >
                  Withdraw
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={link.depositEnabled ? "secondary" : "outline"}
                  aria-pressed={link.depositEnabled}
                  onClick={() => void toggle(link, "depositEnabled")}
                >
                  Deposit
                </Button>
                <IconAction label={`Unlink ${link.code}`} onClick={() => setRemoving(link)}>
                  <TrashIcon />
                </IconAction>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-4 rounded-2xl border border-dashed p-3">
          <p className="text-sm font-medium">Link another chain</p>
          <Field label="Chain" htmlFor="link-chain">
            <LookupSelect
              source={chainLookup}
              label="Chain"
              htmlFor="link-chain"
              placeholder="Search chains"
              emptyMessage="No chains found"
              value={chain}
              onValueChange={setChain}
              onCreate={{
                label: (search) => `Add chain “${search}”`,
                run: (search) =>
                  runMutation(
                    () =>
                      findOrCreateChain({
                        payload: { name: search, code: search },
                        reactivityKeys: [chainsKey]
                      }),
                    { success: (created) => `Chain ${created.code} ready`, failure: "Could not add chain" }
                  )
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Exchange chain code" htmlFor="link-code" hint="The code this exchange uses, for example ERC20.">
              <Input
                id="link-code"
                value={exchangeChainCode}
                onChange={(event) => setExchangeChainCode(event.target.value)}
                placeholder="ERC20"
              />
            </Field>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={withdrawEnabled}
                  onChange={(event) => setWithdrawEnabled(event.target.checked)}
                />
                Withdraw
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={depositEnabled}
                  onChange={(event) => setDepositEnabled(event.target.checked)}
                />
                Deposit
              </label>
            </div>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing === null ? "Unlink chain" : `Unlink ${removing.code}?`}
        description="Routes through this chain disappear immediately; re-linking restores them."
        confirmLabel="Unlink chain"
        pending={pending}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}

/**
 * Coin routes: markets, chain links, and the pairwise transfer matrix.
 */
const CoinRoutes = (props: { readonly id: number }) => {
  const coinId = Schema.decodeSync(CryptocurrencyId)(props.id)
  const metadataAtom = coinMetadataAtom(props.id)
  const metadata = useAtomValue(metadataAtom)
  const refresh = useAtomRefresh(metadataAtom)
  const coin = useAtomValue(coinAtom(props.id))

  const assignMarket = useAtomSet(marketMutations.assign, { mode: "promiseExit" })
  const updateMarket = useAtomSet(marketMutations.update, { mode: "promiseExit" })
  const unassignMarket = useAtomSet(marketMutations.unassign, { mode: "promiseExit" })

  const [assignOpen, setAssignOpen] = useState(false)
  const [exchange, setExchange] = useState<ExchangeModel | null>(null)
  const [assignSymbol, setAssignSymbol] = useState("")
  const [assignListed, setAssignListed] = useState(true)
  const [assignTradeEnabled, setAssignTradeEnabled] = useState(true)

  const [editing, setEditing] = useState<MarketListing | null>(null)
  const [editSymbol, setEditSymbol] = useState("")
  const [editListed, setEditListed] = useState(true)
  const [editTradeEnabled, setEditTradeEnabled] = useState(true)

  const [unassigning, setUnassigning] = useState<MarketListing | null>(null)

  const [managingLinks, setManagingLinks] = useState<MarketListing | null>(null)

  const [routeDetail, setRouteDetail] = useState<{ readonly from: MarketListing; readonly to: MarketListing } | null>(
    null
  )

  const [pending, setPending] = useState(false)

  const markets = AsyncResult.isSuccess(metadata) ? metadata.value.exchanges : []

  const matrix = useMemo(
    () =>
      markets.flatMap((from) =>
        markets
          .filter((to) => to.marketId !== from.marketId)
          .map((to) => ({ from, to, status: orderedPairStatus(toFlags(from), toFlags(to)) }))
      ),
    [markets]
  )

  const chainCodes = useMemo(() => {
    const codes = new Map<number, string>()

    for (const market of markets) {
      for (const chain of market.chains) codes.set(chain.id, chain.code)
    }

    return codes
  }, [markets])

  const distinctChains = chainCodes.size
  const blockedPairs = matrix.filter((cell) => cell.status === "none").length
  const oneWayPairs = matrix.filter((cell) => cell.status === "one-way-blocked" || cell.status === "one-way-other").length

  const submitAssign = useCallback(async () => {
    if (exchange === null || assignSymbol.trim() === "") return

    setPending(true)

    const assigned = await runMutation(
      () =>
        assignMarket({
          payload: {
            exchangeId: exchange.id,
            cryptocurrencyId: coinId,
            exchangeSymbol: assignSymbol.trim(),
            listed: assignListed,
            tradeEnabled: assignTradeEnabled
          },
          reactivityKeys: [marketsKey]
        }),
      { success: (market) => `${exchange.name} market ${market.exchangeSymbol} assigned`, failure: "Could not assign market" }
    )

    setPending(false)

    if (assigned !== undefined) {
      setAssignOpen(false)
      setExchange(null)
      setAssignSymbol("")
      setAssignListed(true)
      setAssignTradeEnabled(true)
    }
  }, [assignListed, assignMarket, assignSymbol, assignTradeEnabled, coinId, exchange])

  const openEdit = useCallback((market: MarketListing) => {
    setEditSymbol(market.symbol)
    setEditListed(market.listed)
    setEditTradeEnabled(market.tradeEnabled)
    setEditing(market)
  }, [])

  const submitEdit = useCallback(async () => {
    if (editing === null) return

    setPending(true)

    const updated = await runMutation(
      () =>
        updateMarket({
          params: { id: editing.marketId },
          payload: {
            exchangeId: editing.id,
            cryptocurrencyId: coinId,
            exchangeSymbol: editSymbol.trim(),
            listed: editListed,
            tradeEnabled: editTradeEnabled
          },
          reactivityKeys: [marketsKey]
        }),
      { success: "Market updated", failure: "Could not update market" }
    )

    setPending(false)

    if (updated !== undefined) setEditing(null)
  }, [coinId, editListed, editSymbol, editTradeEnabled, editing, updateMarket])

  const confirmUnassign = useCallback(async () => {
    if (unassigning === null) return

    setPending(true)

    const removed = await runMutation(
      () => unassignMarket({ params: { id: unassigning.marketId }, reactivityKeys: [marketsKey] }),
      { success: "Market unassigned", failure: "Could not unassign market" }
    )

    setPending(false)

    if (removed !== undefined) setUnassigning(null)
  }, [unassignMarket, unassigning])

  const header = (
    <PageHeader
      back={{ to: "/coins", label: "Coins" }}
      title={
        AsyncResult.isSuccess(coin)
          ? `${coin.value.symbol} routes`
          : AsyncResult.isSuccess(metadata)
          ? `${metadata.value.symbol} routes`
          : "Coin routes"
      }
      description={
        AsyncResult.isSuccess(metadata)
          ? `${metadata.value.name} across ${formatCount(metadata.value.exchanges.length)} markets. A route exists when one market can withdraw on a chain the other can deposit on.`
          : "Market assignments, chain links, and the transfer matrix."
      }
      actions={
        <Button onClick={() => setAssignOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Assign market
        </Button>
      }
    />
  )

  if (
    AsyncResult.isFailure(metadata) &&
    Option.getOrUndefined(Cause.findErrorOption(metadata.cause)) instanceof CryptocurrencyNotFound
  ) {
    return (
      <>
        {header}
        <EmptyState
          icon={CoinsIcon}
          title="Coin not found"
          description="This coin no longer exists. It may have been removed from the coins page."
          action={
            <Button variant="outline" size="sm" render={<Link to="/coins" />}>
              Back to coins
            </Button>
          }
        />
      </>
    )
  }

  if (AsyncResult.isInitial(metadata) || AsyncResult.isWaiting(metadata)) {
    return (
      <>
        {header}
        <DataTable>
          <Head>
            <Th>Exchange</Th>
            <Th>Exchange symbol</Th>
            <Th>Listed</Th>
            <Th>Trade enabled</Th>
            <Th align="right">Chains</Th>
            <Th align="right">Actions</Th>
          </Head>
          <LoadingRows colSpan={6} />
        </DataTable>
      </>
    )
  }

  if (AsyncResult.isFailure(metadata)) {
    return (
      <>
        {header}
        <ErrorAlert
          title="Could not load routes"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      </>
    )
  }

  return (
    <>
      {header}

      <StatStrip
        stats={[
          { label: "Markets", value: formatCount(markets.length) },
          { label: "Chains", value: formatCount(distinctChains), hint: "distinct chains across markets" },
          {
            label: "Blocked pairs",
            value: blockedPairs === 0 ? "0" : <span className="text-destructive">{formatCount(blockedPairs)}</span>,
            hint: "no route in either direction"
          },
          { label: "One-way pairs", value: formatCount(oneWayPairs), hint: "value moves one way only" }
        ]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Markets</h2>
        <DataTable>
          <Head>
            <Th>Exchange</Th>
            <Th>Exchange symbol</Th>
            <Th>Listed</Th>
            <Th>Trade enabled</Th>
            <Th>Chains</Th>
            <Th align="right">Actions</Th>
          </Head>
          <Body>
            {markets.length === 0 ? (
              <Row>
                <Td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No markets yet. Assign this coin to an exchange to start.
                </Td>
              </Row>
            ) : (
              markets.map((market) => (
                <Row key={market.marketId}>
                  <Td>
                    <Link
                      to={`/exchanges/${market.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {market.name}
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">{market.symbol}</Td>
                  <Td>
                    <Badge variant={market.listed ? "secondary" : "outline"}>
                      {market.listed ? "listed" : "delisted"}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={market.tradeEnabled ? "secondary" : "outline"}>
                      {market.tradeEnabled ? "trading" : "disabled"}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      {market.chains.length === 0 ? (
                        <span className="text-xs text-muted-foreground">none</span>
                      ) : (
                        market.chains.map((chain) => (
                          <Badge key={chain.linkId} variant="outline" className="uppercase">
                            {chain.code}
                          </Badge>
                        ))
                      )}
                    </span>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconAction label={`Manage chains for ${market.name}`} onClick={() => setManagingLinks(market)}>
                        <LinkSimpleIcon />
                      </IconAction>
                      <IconAction label={`Edit ${market.name} market`} onClick={() => openEdit(market)}>
                        <PencilSimpleIcon />
                      </IconAction>
                      <IconAction label={`Unassign ${market.name}`} onClick={() => setUnassigning(market)}>
                        <TrashIcon />
                      </IconAction>
                    </div>
                  </Td>
                </Row>
              ))
            )}
          </Body>
        </DataTable>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Transfer matrix</h2>
        {markets.length < 2 ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Assign at least two markets to see transfer routes.
          </div>
        ) : (
          <DataTable>
            <Head>
              <Th>From</Th>
              {markets.map((market) => (
                <Th key={market.marketId} className="max-w-32 truncate">
                  {market.name}
                </Th>
              ))}
            </Head>
            <Body>
              {markets.map((from) => (
                <Row key={from.marketId}>
                  <Td className="font-medium">{from.name}</Td>
                  {markets.map((to) => {
                    if (from.marketId === to.marketId) {
                      return (
                        <Td key={to.marketId} className="text-muted-foreground">
                          —
                        </Td>
                      )
                    }

                    const cell = matrix.find(
                      (candidate) => candidate.from.marketId === from.marketId && candidate.to.marketId === to.marketId
                    )

                    if (cell === undefined) {
                      return <Td key={to.marketId}>?</Td>
                    }

                    return (
                      <Td key={to.marketId}>
                        <button
                          type="button"
                          className="rounded-sm underline-offset-4 hover:underline"
                          onClick={() => setRouteDetail({ from, to })}
                        >
                          <Badge variant={statusVariant(cell.status)}>{statusLabel(cell.status)}</Badge>
                        </button>
                      </Td>
                    )
                  })}
                </Row>
              ))}
            </Body>
          </DataTable>
        )}
      </section>

      <FormDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assign market"
        description="Pick the exchange that lists this coin and the symbol it trades under there."
        submitLabel="Assign market"
        pending={pending}
        onSubmit={() => void submitAssign()}
      >
        <Field label="Exchange" htmlFor="assign-exchange">
          <LookupSelect
            source={exchangeLookup}
            label="Exchange"
            htmlFor="assign-exchange"
            placeholder="Search exchanges"
            emptyMessage="No exchanges found"
            value={exchange}
            onValueChange={setExchange}
          />
        </Field>
        <Field label="Exchange symbol" htmlFor="assign-symbol" hint="As the exchange writes it, for example BTCUSDT.">
          <Input
            id="assign-symbol"
            value={assignSymbol}
            onChange={(event) => setAssignSymbol(event.target.value)}
            placeholder="BTCUSDT"
          />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={assignListed}
              onChange={(event) => setAssignListed(event.target.checked)}
            />
            Listed
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={assignTradeEnabled}
              onChange={(event) => setAssignTradeEnabled(event.target.checked)}
            />
            Trade enabled
          </label>
        </div>
      </FormDialog>

      <FormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title={editing === null ? "Edit market" : `Edit ${editing.name} market`}
        description="Listing and trading flags are what the scanner reads; the exchange symbol is how the market is named."
        submitLabel="Save market"
        pending={pending}
        onSubmit={() => void submitEdit()}
      >
        <Field label="Exchange symbol" htmlFor="edit-market-symbol">
          <Input
            id="edit-market-symbol"
            value={editSymbol}
            onChange={(event) => setEditSymbol(event.target.value)}
          />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={editListed}
              onChange={(event) => setEditListed(event.target.checked)}
            />
            Listed
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={editTradeEnabled}
              onChange={(event) => setEditTradeEnabled(event.target.checked)}
            />
            Trade enabled
          </label>
        </div>
      </FormDialog>

      <ManageLinksDialog
        market={managingLinks}
        open={managingLinks !== null}
        onOpenChange={(open) => {
          if (!open) setManagingLinks(null)
        }}
      />

      <ConfirmDialog
        open={unassigning !== null}
        onOpenChange={(open) => {
          if (!open) setUnassigning(null)
        }}
        title={unassigning === null ? "Unassign market" : `Unassign ${unassigning.name}?`}
        description="The market and all of its chain links are deleted; worker coverage for this coin shrinks."
        confirmLabel="Unassign market"
        pending={pending}
        onConfirm={() => void confirmUnassign()}
      />

      <Dialog
        open={routeDetail !== null}
        onOpenChange={(open) => {
          if (!open) setRouteDetail(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {routeDetail === null ? "Route" : `${routeDetail.from.name} → ${routeDetail.to.name}`}
            </DialogTitle>
            <DialogDescription>
              {routeDetail === null
                ? ""
                : `Coin ${AsyncResult.isSuccess(metadata) ? metadata.value.symbol : ""} on this directed pair.`}
            </DialogDescription>
          </DialogHeader>
          {routeDetail === null ? null : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {orderedPairStatus(toFlags(routeDetail.from), toFlags(routeDetail.to)) === "none" ? (
                  <WarningCircleIcon className="size-4 text-destructive" weight="fill" />
                ) : null}
                <Badge variant={statusVariant(orderedPairStatus(toFlags(routeDetail.from), toFlags(routeDetail.to)))}>
                  {statusLabel(orderedPairStatus(toFlags(routeDetail.from), toFlags(routeDetail.to)))}
                </Badge>
              </div>
              {viableChains(toFlags(routeDetail.from), toFlags(routeDetail.to)).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shared chain carries value in this direction. Enable withdraw on the source and deposit on the
                  destination for the same chain.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {viableChains(toFlags(routeDetail.from), toFlags(routeDetail.to)).map((chainId) => (
                    <li key={chainId} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="uppercase">
                        {chainCodes.get(chainId) ?? String(chainId)}
                      </Badge>
                      carries value
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Route wrapper that validates the coin id before rendering the page.
 */
export const CoinRoutesPage = () => {
  const params = useParams()
  const id = parseRouteId(params["id"])

  if (id === undefined) {
    return (
      <>
        <PageHeader back={{ to: "/coins", label: "Coins" }} title="Coin routes" />
        <EmptyState
          icon={CoinsIcon}
          title="Coin not found"
          description="This address does not identify a coin."
          action={
            <Button variant="outline" size="sm" render={<Link to="/coins" />}>
              Back to coins
            </Button>
          }
        />
      </>
    )
  }

  return <CoinRoutes id={id} />
}
