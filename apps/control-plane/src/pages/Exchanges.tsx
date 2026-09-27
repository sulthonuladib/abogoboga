import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Exchange as ExchangeModel } from "@lister/domain"
import { Badge } from "@lister/ui/components/badge"
import { Button } from "@lister/ui/components/button"
import { Input } from "@lister/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lister/ui/components/select"
import { ArrowsLeftRightIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { exchangeListAtom } from "../api/atoms.ts"
import { exchangesKey } from "../api/keys.ts"
import { exchangeMutations, runMutation } from "../api/mutations.ts"
import { formatTimestamp } from "../lib/format.ts"
import { useDebouncedValue } from "../lib/hooks.ts"
import { parsePageParam } from "../lib/ids.ts"
import { ConfirmDialog, FormDialog } from "../ui/Dialogs.tsx"
import { Field } from "../ui/Field.tsx"
import { PageHeader } from "../ui/PageHeader.tsx"
import { Pagination } from "../ui/Pagination.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { EmptyState, ErrorAlert, IconAction, RetryButton } from "../ui/States.tsx"
import { Body, DataTable, Head, LoadingRows, Row, SortableTh, Td, Th } from "../ui/Table.tsx"

const pageSize = 20

const columns = 6

/**
 * Identity fields the exchange form edits.
 */
export type ExchangeFormValues = {
  readonly name: string
  readonly slug: string
  readonly coingeckoId: string
  readonly logo: string
  readonly baseCurrency: ExchangeModel["baseCurrency"]
  readonly registeredOnCmc: boolean
}

/**
 * Blank values for the create form.
 *
 * New exchanges start on a USDT base currency with CoinMarketCap registration
 * enabled, matching the API defaults.
 *
 * @returns Fresh values so dialogs never share mutable state.
 */
export const emptyExchangeFormValues = (): ExchangeFormValues => ({
  name: "",
  slug: "",
  coingeckoId: "",
  logo: "",
  baseCurrency: "usdt",
  registeredOnCmc: true
})

/**
 * Project a stored exchange onto the fields the form edits.
 *
 * @param exchange - Exchange being edited.
 * @returns The editable identity fields.
 */
export const exchangeFormValues = (exchange: ExchangeModel): ExchangeFormValues => ({
  name: exchange.name,
  slug: exchange.slug,
  coingeckoId: exchange.coingeckoId,
  logo: exchange.logo,
  baseCurrency: exchange.baseCurrency,
  registeredOnCmc: exchange.registeredOnCmc
})

/**
 * Create/edit form body shared by the exchanges listing and detail pages.
 *
 * The dialog owns submission; this component only maps values to controls.
 */
export const ExchangeFormFields = (props: {
  readonly values: ExchangeFormValues
  readonly onChange: (values: ExchangeFormValues) => void
}) => (
  <>
    <Field label="Name" htmlFor="exchange-name">
      <Input
        id="exchange-name"
        value={props.values.name}
        onChange={(event) => props.onChange({ ...props.values, name: event.target.value })}
        placeholder="Binance"
        autoFocus
      />
    </Field>
    <Field label="Slug" htmlFor="exchange-slug" hint="Unique across exchanges and used in links.">
      <Input
        id="exchange-slug"
        value={props.values.slug}
        onChange={(event) => props.onChange({ ...props.values, slug: event.target.value })}
        placeholder="binance"
      />
    </Field>
    <Field label="CoinGecko id" htmlFor="exchange-coingecko-id" hint="The CoinGecko exchange identifier.">
      <Input
        id="exchange-coingecko-id"
        value={props.values.coingeckoId}
        onChange={(event) => props.onChange({ ...props.values, coingeckoId: event.target.value })}
        placeholder="binance"
      />
    </Field>
    <Field label="Logo" htmlFor="exchange-logo" hint="Optional image URL; blank keeps the symbol fallback.">
      <Input
        id="exchange-logo"
        value={props.values.logo}
        onChange={(event) => props.onChange({ ...props.values, logo: event.target.value })}
        placeholder="https://example.com/exchange.png"
      />
    </Field>
    <Field label="Base currency" htmlFor="exchange-base-currency">
      <Select
        id="exchange-base-currency"
        items={{ usdt: "USDT", idr: "IDR" }}
        value={props.values.baseCurrency}
        onValueChange={(value) => {
          if (value === null) return

          props.onChange({ ...props.values, baseCurrency: value })
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="usdt">USDT</SelectItem>
          <SelectItem value="idr">IDR</SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <Field label="Registered on CMC" htmlFor="exchange-registered-on-cmc">
      <Select
        id="exchange-registered-on-cmc"
        items={{ yes: "Yes", no: "No" }}
        value={props.values.registeredOnCmc ? "yes" : "no"}
        onValueChange={(value) => {
          if (value === null) return

          props.onChange({ ...props.values, registeredOnCmc: value === "yes" })
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </>
)

/**
 * Exchanges listing with search, sorting, offset pagination, and CRUD dialogs.
 */
export const ExchangesPage = () => {
  const [params, setParams] = useSearchParams()

  const search = params.get("q") ?? ""
  const page = parsePageParam(params.get("page"))
  const sort = params.get("sort") ?? "name"
  const order = params.get("order") === "desc" ? "desc" : "asc"

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

  const listAtom = exchangeListAtom({
    limit: pageSize,
    search,
    searchBy: ["name", "slug"],
    orderBy: sort === "slug" || sort === "createdAt" ? sort : "name",
    order,
    page
  })

  const list = useAtomValue(listAtom)
  const refresh = useAtomRefresh(listAtom)

  const addExchange = useAtomSet(exchangeMutations.add, { mode: "promiseExit" })
  const updateExchange = useAtomSet(exchangeMutations.update, { mode: "promiseExit" })
  const removeExchange = useAtomSet(exchangeMutations.remove, { mode: "promiseExit" })

  const [editor, setEditor] = useState<
    { readonly mode: "create" } | { readonly mode: "edit"; readonly exchange: ExchangeModel } | null
  >(null)

  const [removing, setRemoving] = useState<ExchangeModel | null>(null)
  const [values, setValues] = useState<ExchangeFormValues>(emptyExchangeFormValues)
  const [pending, setPending] = useState(false)

  const onSort = useCallback(
    (column: string) => {
      setParams((current) => {
        const next = new URLSearchParams(current)

        if (next.get("sort") === column) {
          next.set("order", next.get("order") === "desc" ? "asc" : "desc")
        } else {
          next.set("sort", column)
          next.set("order", "asc")
        }

        next.delete("page")

        return next
      })
    },
    [setParams]
  )

  const openCreate = useCallback(() => {
    setValues(emptyExchangeFormValues())
    setEditor({ mode: "create" })
  }, [])

  const openEdit = useCallback((exchange: ExchangeModel) => {
    setValues(exchangeFormValues(exchange))
    setEditor({ mode: "edit", exchange })
  }, [])

  const submit = useCallback(async () => {
    if (editor === null) return

    setPending(true)

    const payload = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      coingeckoId: values.coingeckoId.trim(),
      logo: values.logo.trim(),
      baseCurrency: values.baseCurrency,
      registeredOnCmc: values.registeredOnCmc
    }

    const succeeded =
      editor.mode === "create"
        ? await runMutation(
          () => addExchange({ payload, reactivityKeys: [exchangesKey] }),
          { success: (created) => `Exchange ${created.name} added`, failure: "Could not add exchange" }
        )
        : await runMutation(
          () =>
            updateExchange({
              params: { id: editor.exchange.id },
              payload,
              reactivityKeys: [exchangesKey]
            }),
          { success: (updated) => `Exchange ${updated.name} saved`, failure: "Could not save exchange" }
        )

    setPending(false)

    if (succeeded !== undefined) setEditor(null)
  }, [addExchange, editor, updateExchange, values])

  const confirmRemove = useCallback(async () => {
    if (removing === null) return

    setPending(true)

    const removed = await runMutation(
      () => removeExchange({ params: { id: removing.id }, reactivityKeys: [exchangesKey] }),
      { success: (exchange) => `Exchange ${exchange.name} removed`, failure: "Could not remove exchange" }
    )

    setPending(false)

    if (removed !== undefined) setRemoving(null)
  }, [removeExchange, removing])

  const canSubmit = values.name.trim() !== "" && values.slug.trim() !== "" && values.coingeckoId.trim() !== ""

  return (
    <>
      <PageHeader
        title="Exchanges"
        description="Venues a coin can be listed on. Search matches the name or slug; rows link to their market assignments."
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            New exchange
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={searchInput}
          onValueChange={setSearchInput}
          placeholder="Search by name or slug"
          className="w-full sm:max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {search === "" ? "All exchanges" : `Matching “${search}”`}
        </p>
      </div>

      {AsyncResult.isInitial(list) || AsyncResult.isWaiting(list) ? (
        <DataTable>
          <Head>
            <SortableTh label="Name" column="name" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Slug" column="slug" sort={sort} order={order} onSort={onSort} />
            <Th>Base currency</Th>
            <Th>Registered on CMC</Th>
            <SortableTh label="Created" column="createdAt" sort={sort} order={order} onSort={onSort} />
            <Th align="right">Actions</Th>
          </Head>
          <LoadingRows colSpan={columns} />
        </DataTable>
      ) : AsyncResult.isFailure(list) ? (
        <ErrorAlert
          title="Could not load exchanges"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : list.value.data.length === 0 ? (
        <EmptyState
          icon={ArrowsLeftRightIcon}
          title={search === "" ? "No exchanges yet" : "No exchanges match"}
          description={
            search === ""
              ? "Add the first exchange so coins can be assigned to a venue."
              : "Try a shorter search, or add the exchange you are looking for."
          }
          action={
            search === "" ? undefined : (
              <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                Clear search
              </Button>
            )
          }
        />
      ) : (
        <DataTable>
          <Head>
            <SortableTh label="Name" column="name" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Slug" column="slug" sort={sort} order={order} onSort={onSort} />
            <Th>Base currency</Th>
            <Th>Registered on CMC</Th>
            <SortableTh label="Created" column="createdAt" sort={sort} order={order} onSort={onSort} />
            <Th align="right">Actions</Th>
          </Head>
          <Body>
            {list.value.data.map((exchange) => (
              <Row key={exchange.id}>
                <Td>
                  <Link
                    to={`/exchanges/${exchange.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {exchange.name}
                  </Link>
                </Td>
                <Td>{exchange.slug}</Td>
                <Td>
                  <Badge variant="outline">{exchange.baseCurrency}</Badge>
                </Td>
                <Td>{exchange.registeredOnCmc ? "yes" : "no"}</Td>
                <Td className="text-muted-foreground">{formatTimestamp(exchange.createdAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <IconAction label={`Edit ${exchange.name}`} onClick={() => openEdit(exchange)}>
                      <PencilSimpleIcon />
                    </IconAction>
                    <IconAction label={`Remove ${exchange.name}`} onClick={() => setRemoving(exchange)}>
                      <TrashIcon />
                    </IconAction>
                  </div>
                </Td>
              </Row>
            ))}
          </Body>
        </DataTable>
      )}

      {AsyncResult.isSuccess(list) ? (
        <Pagination
          meta={list.value.meta}
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
        title={editor?.mode === "edit" ? `Edit ${editor.exchange.name}` : "New exchange"}
        description="Exchanges are shared by every coin assigned to them; slug and CoinGecko id stay unique."
        submitLabel={editor?.mode === "edit" ? "Save exchange" : "Add exchange"}
        pending={pending}
        onSubmit={() => void submit()}
      >
        <ExchangeFormFields values={values} onChange={setValues} />
        {canSubmit ? null : (
          <p className="text-xs text-muted-foreground">Name, slug, and CoinGecko id are required.</p>
        )}
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing === null ? "Remove exchange" : `Remove ${removing.name}?`}
        description="Market assignments on this exchange are removed too, and the assigned coins lose the listing."
        confirmLabel="Remove exchange"
        pending={pending}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}
