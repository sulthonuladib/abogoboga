import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { ChainNotFound } from "@lister/api/client"
import type { ChainLink, Cryptocurrency, Market } from "@lister/domain"
import { Badge } from "@lister/ui/components/badge"
import { Button } from "@lister/ui/components/button"
import { Input } from "@lister/ui/components/input"
import { LinkSimpleIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react"
import { Cause, Option } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { chainAtom, chainLinksAtom, coinIndexAtom, marketIndexAtom, rowsById } from "../api/atoms.ts"
import { chainsKey } from "../api/keys.ts"
import { chainMutations, runMutation } from "../api/mutations.ts"
import { formatCount } from "../lib/format.ts"
import { parseRouteId } from "../lib/ids.ts"
import { ConfirmDialog, FormDialog } from "../ui/Dialogs.tsx"
import { Field } from "../ui/Field.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { EmptyState, ErrorAlert, RetryButton } from "../ui/States.tsx"
import { StatStrip } from "../ui/StatStrip.tsx"
import { Body, DataTable, Head, LoadingRows, Row, Td, Th } from "../ui/Table.tsx"

const linkColumns = 4

const noMarkets: ReadonlyMap<number, Market> = new Map()

const noCoins: ReadonlyMap<number, Cryptocurrency> = new Map()

/**
 * Format a count that may still be loading.
 *
 * @param count - Count derived from the link query, or `undefined` while it loads.
 * @returns The formatted count, or an ellipsis while loading.
 */
const countOrPending = (count: number | undefined): string => (count === undefined ? "…" : formatCount(count))

/**
 * Distinct exchange and coin counts across one chain's links.
 *
 * A link names a market assignment; the exchange and coin behind it come from
 * resolving that assignment through the market index, so an index that has not
 * loaded yields no counts rather than guesses.
 *
 * @param links - Every link of one chain.
 * @param markets - Market index used to resolve link assignments.
 * @returns The distinct exchange and coin counts.
 */
const summarizeLinks = (links: ReadonlyArray<ChainLink>, markets: ReadonlyMap<number, Market>) => {
  const exchangeIds = new Set<number>()
  const coinIds = new Set<number>()

  for (const link of links) {
    const market = markets.get(link.exchangeCryptocurrencyId)

    if (market === undefined) continue

    exchangeIds.add(market.exchangeId)
    coinIds.add(market.cryptocurrencyId)
  }

  return { exchanges: exchangeIds.size, coins: coinIds.size }
}

/**
 * Market cell for one chain link: the coin symbol, linked to its routes page,
 * with the exchange's own symbol for the market beside it.
 */
const LinkMarketCell = (props: {
  readonly marketId: number
  readonly markets: ReadonlyMap<number, Market>
  readonly coins: ReadonlyMap<number, Cryptocurrency>
}) => {
  const market = props.markets.get(props.marketId)

  if (market === undefined) {
    return <span className="text-muted-foreground">…</span>
  }

  const coin = props.coins.get(market.cryptocurrencyId)

  return (
    <span className="inline-flex items-baseline gap-2">
      {coin === undefined ? (
        <span className="text-muted-foreground">market #{market.id}</span>
      ) : (
        <Link
          to={`/coins/${coin.id}/routes`}
          className="font-medium uppercase underline-offset-4 hover:underline"
        >
          {coin.symbol}
        </Link>
      )}
      <span className="text-xs text-muted-foreground">{market.exchangeSymbol}</span>
    </span>
  )
}

/**
 * Chain detail: identity, coverage, and every market link that uses the chain.
 */
const ChainDetail = (props: { readonly id: number }) => {
  const chainQuery = chainAtom(props.id)
  const chain = useAtomValue(chainQuery)
  const refreshChain = useAtomRefresh(chainQuery)

  const linksQuery = chainLinksAtom(props.id)
  const links = useAtomValue(linksQuery)
  const refreshLinks = useAtomRefresh(linksQuery)

  const markets = useAtomValue(marketIndexAtom())
  const coins = useAtomValue(coinIndexAtom())

  const updateChain = useAtomSet(chainMutations.update, { mode: "promiseExit" })
  const removeChain = useAtomSet(chainMutations.remove, { mode: "promiseExit" })
  const navigate = useNavigate()

  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)

  const chainValue = AsyncResult.isSuccess(chain) ? chain.value : undefined
  const linksValue = AsyncResult.isSuccess(links) ? links.value : undefined
  const marketRows = AsyncResult.isSuccess(markets) ? rowsById(markets.value) : undefined
  const coinRows = AsyncResult.isSuccess(coins) ? rowsById(coins.value.data) : undefined

  const marketsCount = linksValue === undefined ? undefined : linksValue.length

  const summary = linksValue === undefined || marketRows === undefined
    ? undefined
    : summarizeLinks(linksValue, marketRows)

  const openEdit = useCallback(() => {
    if (chainValue === undefined) return

    setName(chainValue.name)
    setCode(chainValue.code)
    setEditorOpen(true)
  }, [chainValue])

  const save = useCallback(async () => {
    if (chainValue === undefined) return

    setPending(true)

    const saved = await runMutation(
      () =>
        updateChain({
          params: { id: chainValue.id },
          payload: { name: name.trim(), code: code.trim() },
          reactivityKeys: [chainsKey]
        }),
      { success: (updated) => `Chain ${updated.code} saved`, failure: "Could not save chain" }
    )

    setPending(false)

    if (saved !== undefined) setEditorOpen(false)
  }, [chainValue, code, name, updateChain])

  const confirmRemove = useCallback(async () => {
    if (chainValue === undefined) return

    setPending(true)

    const removed = await runMutation(
      () => removeChain({ params: { id: chainValue.id }, reactivityKeys: [chainsKey] }),
      { success: (removedChain) => `Chain ${removedChain.code} removed`, failure: "Could not remove chain" }
    )

    setPending(false)

    if (removed !== undefined) void navigate("/chains")
  }, [chainValue, navigate, removeChain])

  const canSubmit = name.trim() !== "" && code.trim() !== ""

  const header = (
    <PageHeader
      back={{ to: "/chains", label: "Chains" }}
      title={
        chainValue === undefined ? "Chain" : (
          <span className="inline-flex items-baseline gap-2">
            <span className="uppercase">{chainValue.code}</span>
            <span className="text-muted-foreground">{chainValue.name}</span>
          </span>
        )
      }
      description="Every market route that settles on this chain, with its deposit and withdraw flags."
      actions={
        chainValue === undefined ? undefined : (
          <>
            <Button variant="outline" onClick={openEdit}>
              <PencilSimpleIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setConfirmingRemove(true)}>
              <TrashIcon data-icon="inline-start" />
              Remove
            </Button>
          </>
        )
      }
    />
  )

  if (AsyncResult.isFailure(chain)) {
    const failure = Option.getOrUndefined(Cause.findErrorOption(chain.cause))

    if (failure instanceof ChainNotFound) {
      return (
        <>
          {header}
          <EmptyState
            icon={LinkSimpleIcon}
            title="Chain not found"
            description="This chain no longer exists. It may have been removed from the chains page."
            action={
              <Button variant="outline" size="sm" render={<Link to="/chains" />}>
                Back to chains
              </Button>
            }
          />
        </>
      )
    }

    return (
      <>
        {header}
        <ErrorAlert
          title="Could not load chain"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refreshChain()} />}
        />
      </>
    )
  }

  return (
    <>
      {header}

      <StatStrip
        stats={[
          { label: "Markets", value: countOrPending(marketsCount), hint: "assignments on this chain" },
          { label: "Exchanges", value: countOrPending(summary?.exchanges), hint: "distinct exchanges" },
          { label: "Coins", value: countOrPending(summary?.coins), hint: "distinct coins" }
        ]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Market links</h2>

        {AsyncResult.isInitial(links) || AsyncResult.isWaiting(links) ? (
          <DataTable>
            <Head>
              <Th>Market</Th>
              <Th>Exchange chain code</Th>
              <Th>Withdraw</Th>
              <Th>Deposit</Th>
            </Head>
            <LoadingRows colSpan={linkColumns} />
          </DataTable>
        ) : AsyncResult.isFailure(links) ? (
          <ErrorAlert
            title="Could not load chain links"
            description="Check that the control-plane process is running, then retry."
            action={<RetryButton onRetry={() => refreshLinks()} />}
          />
        ) : links.value.length === 0 ? (
          <EmptyState
            icon={LinkSimpleIcon}
            title="No markets on this chain"
            description="Link a market to this chain from a coin's routes page."
            action={
              <Button variant="outline" size="sm" render={<Link to="/coins" />}>
                Browse coins
              </Button>
            }
          />
        ) : (
          <DataTable>
            <Head>
              <Th>Market</Th>
              <Th>Exchange chain code</Th>
              <Th>Withdraw</Th>
              <Th>Deposit</Th>
            </Head>
            <Body>
              {links.value.map((link) => (
                <Row key={link.id}>
                  <Td>
                    <LinkMarketCell
                      marketId={link.exchangeCryptocurrencyId}
                      markets={marketRows ?? noMarkets}
                      coins={coinRows ?? noCoins}
                    />
                  </Td>
                  <Td>{link.exchangeChainCode}</Td>
                  <Td>
                    <Badge variant={link.withdrawEnabled ? "secondary" : "outline"}>
                      {link.withdrawEnabled ? "enabled" : "disabled"}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={link.depositEnabled ? "secondary" : "outline"}>
                      {link.depositEnabled ? "enabled" : "disabled"}
                    </Badge>
                  </Td>
                </Row>
              ))}
            </Body>
          </DataTable>
        )}
      </section>

      <FormDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={chainValue === undefined ? "Edit chain" : `Edit ${chainValue.code}`}
        description="The code identifies the chain across every exchange, for example ETH."
        submitLabel="Save chain"
        pending={pending}
        onSubmit={() => void save()}
      >
        <Field label="Code" htmlFor="chain-detail-code" hint="Unique across chains, as used by exchanges.">
          <Input
            id="chain-detail-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ETH"
            autoFocus
          />
        </Field>
        <Field label="Name" htmlFor="chain-detail-name">
          <Input
            id="chain-detail-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ethereum"
          />
        </Field>
        {canSubmit ? null : <p className="text-xs text-muted-foreground">Code and name are both required.</p>}
      </FormDialog>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title={chainValue === undefined ? "Remove chain" : `Remove ${chainValue.code}?`}
        description="Markets linked to this chain lose the link, and routes through it disappear."
        confirmLabel="Remove chain"
        pending={pending}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}

/**
 * Route wrapper that validates the chain id before rendering the detail page.
 */
export const ChainDetailPage = () => {
  const params = useParams()
  const id = parseRouteId(params["id"])

  if (id === undefined) {
    return (
      <>
        <PageHeader back={{ to: "/chains", label: "Chains" }} title="Chain" />
        <EmptyState
          icon={LinkSimpleIcon}
          title="Chain not found"
          description="This address does not identify a chain."
          action={
            <Button variant="outline" size="sm" render={<Link to="/chains" />}>
              Back to chains
            </Button>
          }
        />
      </>
    )
  }

  return <ChainDetail id={id} />
}
