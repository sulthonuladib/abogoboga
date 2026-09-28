import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button } from "@lister/ui/components/button"
import { Input } from "@lister/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@lister/ui/components/select"
import type { CryptocurrencyStat } from "@lister/api/client"
import { CoinsIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { coinStatsAtom } from "../api/atoms.ts"
import { coinsKey } from "../api/keys.ts"
import { coinMutations, runMutation } from "../api/mutations.ts"
import { useDebouncedValue } from "../lib/hooks.ts"
import { parsePageParam } from "../lib/ids.ts"
import { BlockedCell, MarketsCell } from "../ui/Coverage.tsx"
import { ConfirmDialog, FormDialog } from "../ui/Dialogs.tsx"
import { Field } from "../ui/Field.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { Pagination } from "../ui/Pagination.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { EmptyState, ErrorAlert, IconAction, RetryButton } from "../ui/States.tsx"
import { Body, DataTable, Head, LoadingRows, Row, SortableTh, Td, Th } from "../ui/Table.tsx"

const pageSize = 20

const columns = 6

type StatsSort = "symbol" | "markets" | "chains" | "blocked"

type StatsFlag = "all" | "blocked" | "single"

const sortFields: ReadonlyArray<StatsSort> = ["symbol", "markets", "chains", "blocked"]

const parseSort = (raw: string | null): StatsSort =>
  sortFields.find((field) => field === raw) ?? "symbol"

const parseFlag = (raw: string | null): StatsFlag => (raw === "blocked" || raw === "single" ? raw : "all")

const flagItems: ReadonlyArray<{ readonly value: StatsFlag; readonly label: string }> = [
  { value: "all", label: "All coins" },
  { value: "blocked", label: "Blocked routes" },
  { value: "single", label: "Single market" }
]

/**
 * Coin listing with coverage counts, search, filters, and CRUD dialogs.
 */
export const CoinsPage = () => {
  const [params, setParams] = useSearchParams()

  const search = params.get("q") ?? ""
  const flag = parseFlag(params.get("flag"))
  const sort = parseSort(params.get("sort"))
  const order = params.get("order") === "desc" ? "desc" : "asc"
  const page = parsePageParam(params.get("page"))

  const [searchInput, setSearchInput] = useState(search)
  const debouncedSearch = useDebouncedValue(searchInput, 250)

  useEffect(() => {
    if (debouncedSearch === search) return

    setParams(
      (current) => {
        const next = new URLSearchParams(current)

        if (debouncedSearch === "") {
          next.delete("q")
        } else {
          next.set("q", debouncedSearch)
        }

        next.delete("page")

        return next
      },
      { replace: true }
    )
  }, [debouncedSearch, search, setParams])

  const statsAtom = coinStatsAtom({ limit: pageSize, search, flag, sortBy: sort, order, page })
  const stats = useAtomValue(statsAtom)
  const refresh = useAtomRefresh(statsAtom)

  const addCoin = useAtomSet(coinMutations.add, { mode: "promiseExit" })
  const updateCoin = useAtomSet(coinMutations.update, { mode: "promiseExit" })
  const removeCoin = useAtomSet(coinMutations.remove, { mode: "promiseExit" })

  const [editor, setEditor] = useState<
    { readonly mode: "create" } | { readonly mode: "edit"; readonly coin: CryptocurrencyStat } | null
  >(null)

  const [removing, setRemoving] = useState<CryptocurrencyStat | null>(null)
  const [form, setForm] = useState({ name: "", symbol: "", slug: "", coingeckoId: "", logo: "" })
  const [pending, setPending] = useState(false)

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      setParams((current) => {
        const next = new URLSearchParams(current)

        if (value === undefined) {
          next.delete(key)
        } else {
          next.set(key, value)
        }

        next.delete("page")

        return next
      })
    },
    [setParams]
  )

  const onSort = useCallback(
    (column: string) => {
      const field = parseSort(column)

      setParams((current) => {
        const next = new URLSearchParams(current)

        if (next.get("sort") === field) {
          next.set("order", next.get("order") === "desc" ? "asc" : "desc")
        } else {
          next.set("sort", field)
          next.set("order", "asc")
        }

        next.delete("page")

        return next
      })
    },
    [setParams]
  )

  const openCreate = useCallback(() => {
    setForm({ name: "", symbol: "", slug: "", coingeckoId: "", logo: "" })
    setEditor({ mode: "create" })
  }, [])

  const openEdit = useCallback((coin: CryptocurrencyStat) => {
    setForm({ name: coin.name, symbol: coin.symbol, slug: coin.slug, coingeckoId: coin.coingeckoId, logo: coin.logo })
    setEditor({ mode: "edit", coin })
  }, [])

  const submit = useCallback(async () => {
    if (editor === null) return

    setPending(true)

    const payload = {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      slug: form.slug.trim(),
      coingeckoId: form.coingeckoId.trim()
    }

    const succeeded =
      editor.mode === "create"
        ? await runMutation(
          () => addCoin({ payload: { ...payload, logo: form.logo.trim() }, reactivityKeys: [coinsKey] }),
          { success: (created) => `Coin ${created.symbol} added`, failure: "Could not add coin" }
        )
        : await runMutation(
          () => updateCoin({ params: { id: editor.coin.id }, payload, reactivityKeys: [coinsKey] }),
          { success: (updated) => `Coin ${updated.symbol} saved`, failure: "Could not save coin" }
        )

    setPending(false)

    if (succeeded !== undefined) setEditor(null)
  }, [addCoin, editor, form, updateCoin])

  const confirmRemove = useCallback(async () => {
    if (removing === null) return

    setPending(true)

    const removed = await runMutation(
      () => removeCoin({ params: { id: removing.id }, reactivityKeys: [coinsKey] }),
      { success: (coin) => `Coin ${coin.symbol} removed`, failure: "Could not remove coin" }
    )

    setPending(false)

    if (removed !== undefined) setRemoving(null)
  }, [removeCoin, removing])

  const canSubmit = form.name.trim() !== "" && form.symbol.trim() !== "" &&
    form.slug.trim() !== "" && form.coingeckoId.trim() !== ""

  return (
    <>
      <PageHeader
        title="Coins"
        description="Coverage per coin: how many exchanges list it, on how many chains, and how many market pairs have no transfer route."
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            New coin
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={searchInput}
          onValueChange={setSearchInput}
          placeholder="Search by symbol or name"
        />
        <Select
          value={flag}
          items={flagItems}
          onValueChange={(value: string | null) => updateParam("flag", value === null || value === "all" ? undefined : value)}
        >
          <SelectTrigger size="sm" aria-label="Coverage filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {flagItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {search === "" ? null : (
          <p className="text-sm text-muted-foreground">Matching “{search}”</p>
        )}
      </div>

      {AsyncResult.isInitial(stats) || AsyncResult.isWaiting(stats) ? (
        <DataTable>
          <Head>
            <SortableTh label="Coin" column="symbol" sort={sort} order={order} onSort={onSort} />
            <Th>Name</Th>
            <SortableTh label="Markets" column="markets" sort={sort} order={order} onSort={onSort} align="right" />
            <SortableTh label="Chains" column="chains" sort={sort} order={order} onSort={onSort} align="right" />
            <SortableTh label="Blocked" column="blocked" sort={sort} order={order} onSort={onSort} align="right" />
            <Th align="right">Actions</Th>
          </Head>
          <LoadingRows colSpan={columns} />
        </DataTable>
      ) : AsyncResult.isFailure(stats) ? (
        <ErrorAlert
          title="Could not load coins"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : stats.value.data.length === 0 ? (
        <EmptyState
          icon={CoinsIcon}
          title={search === "" && flag === "all" ? "No coins yet" : "No coins match"}
          description={
            search === "" && flag === "all"
              ? "Add the first coin, then assign it to exchanges."
              : "Try a shorter search or a different coverage filter."
          }
          action={
            search === "" && flag === "all" ? undefined : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchInput("")
                  setParams({}, { replace: true })
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <DataTable>
          <Head>
            <SortableTh label="Coin" column="symbol" sort={sort} order={order} onSort={onSort} />
            <Th>Name</Th>
            <SortableTh label="Markets" column="markets" sort={sort} order={order} onSort={onSort} align="right" />
            <SortableTh label="Chains" column="chains" sort={sort} order={order} onSort={onSort} align="right" />
            <SortableTh label="Blocked" column="blocked" sort={sort} order={order} onSort={onSort} align="right" />
            <Th align="right">Actions</Th>
          </Head>
          <Body>
            {stats.value.data.map((coin) => (
              <Row key={coin.id}>
                <Td>
                  <Link
                    to={`/coins/${coin.id}/routes`}
                    className="font-medium uppercase underline-offset-4 hover:underline"
                  >
                    {coin.symbol}
                  </Link>
                </Td>
                <Td>{coin.name}</Td>
                <Td align="right">
                  <MarketsCell markets={coin.markets} />
                </Td>
                <Td align="right">{coin.chains}</Td>
                <Td align="right">
                  <BlockedCell blocked={coin.blocked} />
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <IconAction label={`Edit ${coin.symbol}`} onClick={() => openEdit(coin)}>
                      <PencilSimpleIcon />
                    </IconAction>
                    <IconAction label={`Remove ${coin.symbol}`} onClick={() => setRemoving(coin)}>
                      <TrashIcon />
                    </IconAction>
                  </div>
                </Td>
              </Row>
            ))}
          </Body>
        </DataTable>
      )}

      {AsyncResult.isSuccess(stats) ? (
        <Pagination
          meta={stats.value.meta}
          onPageChange={(nextPage) =>
            setParams((current) => {
              const next = new URLSearchParams(current)

              next.set("page", String(nextPage))

              return next
            })
          }
        />
      ) : null}

      <FormDialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        title={editor?.mode === "edit" ? `Edit ${editor.coin.symbol}` : "New coin"}
        description="The CoinGecko id and slug are unique; the symbol is what exchanges trade under."
        submitLabel={editor?.mode === "edit" ? "Save coin" : "Add coin"}
        pending={pending}
        onSubmit={() => void submit()}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Symbol" htmlFor="coin-symbol">
            <Input
              id="coin-symbol"
              value={form.symbol}
              onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))}
              placeholder="BTC"
            />
          </Field>
          <Field label="Name" htmlFor="coin-name">
            <Input
              id="coin-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Bitcoin"
            />
          </Field>
        </div>
        <Field label="Slug" htmlFor="coin-slug" hint="URL-friendly id, for example bitcoin.">
          <Input
            id="coin-slug"
            value={form.slug}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="bitcoin"
          />
        </Field>
        <Field label="CoinGecko id" htmlFor="coin-coingecko" hint="Used by the scanner to match the coin.">
          <Input
            id="coin-coingecko"
            value={form.coingeckoId}
            onChange={(event) => setForm((current) => ({ ...current, coingeckoId: event.target.value }))}
            placeholder="bitcoin"
          />
        </Field>
        {editor?.mode === "create" ? (
          <Field label="Logo" htmlFor="coin-logo" hint="Optional; leave empty to render the symbol instead.">
            <Input
              id="coin-logo"
              value={form.logo}
              onChange={(event) => setForm((current) => ({ ...current, logo: event.target.value }))}
              placeholder="https://…"
            />
          </Field>
        ) : null}
        {canSubmit ? null : <p className="text-xs text-muted-foreground">Symbol, name, slug, and CoinGecko id are required.</p>}
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing === null ? "Remove coin" : `Remove ${removing.symbol}?`}
        description="Market assignments and chain links for this coin are deleted with it, and worker coverage shrinks."
        confirmLabel="Remove coin"
        pending={pending}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}
