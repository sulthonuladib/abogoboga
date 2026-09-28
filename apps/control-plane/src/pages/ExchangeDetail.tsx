import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Exchange as ExchangeModel } from "@lister/domain"
import { Badge } from "@lister/ui/components/badge"
import { Button } from "@lister/ui/components/button"
import { CoinsIcon, PencilSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useState } from "react"
import { Link, useParams } from "react-router"
import { coinIndexAtom, exchangeAtom, exchangeMarketsAtom, rowsById } from "../api/atoms.ts"
import { exchangesKey } from "../api/keys.ts"
import { exchangeMutations, runMutation } from "../api/mutations.ts"
import { formatCount } from "../lib/format.ts"
import { parseRouteId } from "../lib/ids.ts"
import { FormDialog } from "../ui/Dialogs.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { EmptyState, ErrorAlert, RetryButton } from "../ui/States.tsx"
import { StatStrip } from "../ui/StatStrip.tsx"
import { Body, DataTable, Head, LoadingRows, Row, Td, Th } from "../ui/Table.tsx"
import {
  emptyExchangeFormValues,
  ExchangeFormFields,
  type ExchangeFormValues,
  exchangeFormValues
} from "./Exchanges.tsx"

const columns = 4

/**
 * Header description for a loaded exchange.
 *
 * @param exchange - Exchange shown in the header.
 * @returns A sentence naming its base currency, CoinGecko id, and CMC state.
 */
const identityDescription = (exchange: ExchangeModel): string =>
  `Base currency ${exchange.baseCurrency.toUpperCase()}. CoinGecko id ${exchange.coingeckoId}. ` +
  (exchange.registeredOnCmc ? "Registered on CoinMarketCap." : "Not registered on CoinMarketCap.")

/**
 * Not-found notice for address segments that are not exchange ids.
 */
const InvalidExchange = () => (
  <EmptyState
    icon={WarningCircleIcon}
    title="Exchange not found"
    description="This address does not identify an exchange. Open the exchanges list and pick one."
    action={
      <Button variant="outline" size="sm" render={<Link to="/exchanges" />}>
        Back to exchanges
      </Button>
    }
  />
)

/**
 * One exchange's identity, coverage numbers, and market assignments.
 *
 * The id is parsed before this component mounts, so every query receives a
 * number and the detail hooks stay unconditional.
 */
const ExchangeDetail = (props: { readonly id: number }) => {
  const exchangeQuery = exchangeAtom(props.id)
  const marketsQuery = exchangeMarketsAtom(props.id)
  const coinIndexQuery = coinIndexAtom()

  const exchange = useAtomValue(exchangeQuery)
  const markets = useAtomValue(marketsQuery)
  const coinIndex = useAtomValue(coinIndexQuery)

  const refreshExchange = useAtomRefresh(exchangeQuery)
  const refreshMarkets = useAtomRefresh(marketsQuery)
  const refreshCoinIndex = useAtomRefresh(coinIndexQuery)

  const updateExchange = useAtomSet(exchangeMutations.update, { mode: "promiseExit" })

  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<ExchangeFormValues>(emptyExchangeFormValues)
  const [pending, setPending] = useState(false)

  const exchangeValue = AsyncResult.isSuccess(exchange) ? exchange.value : undefined
  const marketsValue = AsyncResult.isSuccess(markets) ? markets.value : undefined
  const coinIndexValue = AsyncResult.isSuccess(coinIndex) ? coinIndex.value : undefined

  const failed = AsyncResult.isFailure(exchange) || AsyncResult.isFailure(markets) ||
    AsyncResult.isFailure(coinIndex)

  const coinsById = coinIndexValue === undefined ? undefined : rowsById(coinIndexValue.data)

  const openEdit = useCallback(() => {
    if (exchangeValue === undefined) return

    setValues(exchangeFormValues(exchangeValue))
    setEditing(true)
  }, [exchangeValue])

  const submit = useCallback(async () => {
    if (exchangeValue === undefined) return

    setPending(true)

    const payload = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      coingeckoId: values.coingeckoId.trim(),
      logo: values.logo.trim(),
      baseCurrency: values.baseCurrency,
      registeredOnCmc: values.registeredOnCmc
    }

    const saved = await runMutation(
      () => updateExchange({ params: { id: exchangeValue.id }, payload, reactivityKeys: [exchangesKey] }),
      { success: (updated) => `Exchange ${updated.name} saved`, failure: "Could not save exchange" }
    )

    setPending(false)

    if (saved !== undefined) setEditing(false)
  }, [exchangeValue, updateExchange, values])

  const canSubmit = values.name.trim() !== "" && values.slug.trim() !== "" && values.coingeckoId.trim() !== ""

  return (
    <>
      <PageHeader
        title={exchangeValue === undefined ? "Exchange" : exchangeValue.name}
        description={
          exchangeValue === undefined
            ? (failed ? "This exchange could not be loaded." : "Loading exchange.")
            : identityDescription(exchangeValue)
        }
        back={{ to: "/exchanges", label: "Exchanges" }}
        actions={
          exchangeValue === undefined ? undefined : (
            <Button variant="outline" size="sm" onClick={openEdit}>
              <PencilSimpleIcon data-icon="inline-start" />
              Edit
            </Button>
          )
        }
      />

      {failed ? (
        <ErrorAlert
          title="Could not load exchange"
          description="Check that the control-plane process is running, then retry."
          action={
            <RetryButton
              onRetry={() => {
                refreshExchange()
                refreshMarkets()
                refreshCoinIndex()
              }}
            />
          }
        />
      ) : (
        <>
          <StatStrip
            stats={[
              {
                label: "Markets listed",
                value: marketsValue === undefined
                  ? "…"
                  : formatCount(marketsValue.filter((market) => market.listed).length),
                hint: "visible in the coin list"
              },
              {
                label: "Trade enabled",
                value: marketsValue === undefined
                  ? "…"
                  : formatCount(marketsValue.filter((market) => market.tradeEnabled).length),
                hint: "routes may trade through them"
              },
              {
                label: "Assigned coins",
                value: marketsValue === undefined ? "…" : formatCount(marketsValue.length),
                hint: "market assignments on this exchange"
              }
            ]}
          />

          {marketsValue === undefined ? (
            <DataTable>
              <Head>
                <Th>Coin</Th>
                <Th>Exchange symbol</Th>
                <Th>Listed</Th>
                <Th>Trade enabled</Th>
              </Head>
              <LoadingRows colSpan={columns} />
            </DataTable>
          ) : marketsValue.length === 0 ? (
            <EmptyState
              icon={CoinsIcon}
              title="No markets yet"
              description="Assign a coin to this exchange from the coin routes page, then its markets appear here."
              action={
                <Button variant="outline" size="sm" render={<Link to="/coins" />}>
                  Browse coins
                </Button>
              }
            />
          ) : (
            <DataTable>
              <Head>
                <Th>Coin</Th>
                <Th>Exchange symbol</Th>
                <Th>Listed</Th>
                <Th>Trade enabled</Th>
              </Head>
              <Body>
                {marketsValue.map((market) => {
                  const coin = coinsById?.get(market.cryptocurrencyId)

                  return (
                    <Row key={market.id}>
                      <Td>
                        {coin === undefined ? (
                          <span className="text-muted-foreground">Coin #{market.cryptocurrencyId}</span>
                        ) : (
                          <Link
                            to={`/coins/${market.cryptocurrencyId}/routes`}
                            className="underline-offset-4 hover:underline"
                          >
                            <span className="font-medium">{coin.symbol}</span>{" "}
                            <span className="text-muted-foreground">{coin.name}</span>
                          </Link>
                        )}
                      </Td>
                      <Td>{market.exchangeSymbol}</Td>
                      <Td>
                        <Badge variant={market.listed ? "secondary" : "outline"}>
                          {market.listed ? "listed" : "not listed"}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant={market.tradeEnabled ? "secondary" : "outline"}>
                          {market.tradeEnabled ? "enabled" : "disabled"}
                        </Badge>
                      </Td>
                    </Row>
                  )
                })}
              </Body>
            </DataTable>
          )}
        </>
      )}

      <FormDialog
        open={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(false)
        }}
        title={exchangeValue === undefined ? "Edit exchange" : `Edit ${exchangeValue.name}`}
        description="Changes apply wherever the exchange is listed."
        submitLabel="Save exchange"
        pending={pending}
        onSubmit={() => void submit()}
      >
        <ExchangeFormFields values={values} onChange={setValues} />
        {canSubmit ? null : (
          <p className="text-xs text-muted-foreground">Name, slug, and CoinGecko id are required.</p>
        )}
      </FormDialog>
    </>
  )
}

/**
 * Exchange detail: identity, coverage, and every market assignment.
 */
export const ExchangeDetailPage = () => {
  const params = useParams()
  const id = parseRouteId(params.id)

  if (id === undefined) return <InvalidExchange />

  return <ExchangeDetail id={id} />
}
