import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { Input } from "@lister/ui/components/input"
import { Button } from "@lister/ui/components/button"
import type { Chain as ChainModel } from "@lister/domain"
import { LinkSimpleIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { chainListAtom } from "../api/atoms.ts"
import { chainsKey } from "../api/keys.ts"
import { chainMutations, runMutation } from "../api/mutations.ts"
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

const columns = 4

/**
 * Chains listing with search, sorting, offset pagination, and CRUD dialogs.
 */
export const ChainsPage = () => {
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

  const listAtom = chainListAtom({
    limit: pageSize,
    search,
    searchBy: ["name", "code"],
    orderBy: sort === "name" || sort === "code" || sort === "createdAt" ? sort : "id",
    order,
    page
  })

  const list = useAtomValue(listAtom)
  const refresh = useAtomRefresh(listAtom)

  const addChain = useAtomSet(chainMutations.add, { mode: "promiseExit" })
  const updateChain = useAtomSet(chainMutations.update, { mode: "promiseExit" })
  const removeChain = useAtomSet(chainMutations.remove, { mode: "promiseExit" })

  const [editor, setEditor] = useState<
    { readonly mode: "create" } | { readonly mode: "edit"; readonly chain: ChainModel } | null
  >(null)

  const [removing, setRemoving] = useState<ChainModel | null>(null)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
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
    setName("")
    setCode("")
    setEditor({ mode: "create" })
  }, [])

  const openEdit = useCallback((chain: ChainModel) => {
    setName(chain.name)
    setCode(chain.code)
    setEditor({ mode: "edit", chain })
  }, [])

  const submit = useCallback(async () => {
    if (editor === null) return

    setPending(true)

    const succeeded =
      editor.mode === "create"
        ? await runMutation(
          () => addChain({ payload: { name: name.trim(), code: code.trim() }, reactivityKeys: [chainsKey] }),
          { success: (created) => `Chain ${created.code} added`, failure: "Could not add chain" }
        )
        : await runMutation(
          () =>
            updateChain({
              params: { id: editor.chain.id },
              payload: { name: name.trim(), code: code.trim() },
              reactivityKeys: [chainsKey]
            }),
          { success: (updated) => `Chain ${updated.code} saved`, failure: "Could not save chain" }
        )

    setPending(false)

    if (succeeded !== undefined) setEditor(null)
  }, [addChain, code, editor, name, updateChain])

  const confirmRemove = useCallback(async () => {
    if (removing === null) return

    setPending(true)

    const removed = await runMutation(
      () => removeChain({ params: { id: removing.id }, reactivityKeys: [chainsKey] }),
      { success: (chain) => `Chain ${chain.code} removed`, failure: "Could not remove chain" }
    )

    setPending(false)

    if (removed !== undefined) setRemoving(null)
  }, [removeChain, removing])

  const canSubmit = name.trim() !== "" && code.trim() !== ""

  return (
    <>
      <PageHeader
        title="Chains"
        description="Networks a market can move value on. Chains are shared across exchanges; codes are unique."
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            New chain
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={searchInput}
          onValueChange={setSearchInput}
          placeholder="Search by name or code"
          className="w-full sm:max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {search === "" ? "All chains" : `Matching “${search}”`}
        </p>
      </div>

      {AsyncResult.isInitial(list) || AsyncResult.isWaiting(list) ? (
        <DataTable>
          <Head>
            <SortableTh label="Code" column="code" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Name" column="name" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Created" column="createdAt" sort={sort} order={order} onSort={onSort} />
            <Th align="right">Actions</Th>
          </Head>
          <LoadingRows colSpan={columns} />
        </DataTable>
      ) : AsyncResult.isFailure(list) ? (
        <ErrorAlert
          title="Could not load chains"
          description="Check that the control-plane process is running, then retry."
          action={<RetryButton onRetry={() => refresh()} />}
        />
      ) : list.value.data.length === 0 ? (
        <EmptyState
          icon={LinkSimpleIcon}
          title={search === "" ? "No chains yet" : "No chains match"}
          description={
            search === ""
              ? "Add the first chain to start linking markets."
              : "Try a shorter search, or add the chain you are looking for."
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
            <SortableTh label="Code" column="code" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Name" column="name" sort={sort} order={order} onSort={onSort} />
            <SortableTh label="Created" column="createdAt" sort={sort} order={order} onSort={onSort} />
            <Th align="right">Actions</Th>
          </Head>
          <Body>
            {list.value.data.map((chain) => (
              <Row key={chain.id}>
                <Td>
                  <Link
                    to={`/chains/${chain.id}`}
                    className="font-medium uppercase underline-offset-4 hover:underline"
                  >
                    {chain.code}
                  </Link>
                </Td>
                <Td>{chain.name}</Td>
                <Td className="text-muted-foreground">{formatTimestamp(chain.createdAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <IconAction label={`Edit ${chain.code}`} onClick={() => openEdit(chain)}>
                      <PencilSimpleIcon />
                    </IconAction>
                    <IconAction label={`Remove ${chain.code}`} onClick={() => setRemoving(chain)}>
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
        title={editor?.mode === "edit" ? `Edit ${editor.chain.code}` : "New chain"}
        description="The code identifies the chain across every exchange, for example ETH."
        submitLabel={editor?.mode === "edit" ? "Save chain" : "Add chain"}
        pending={pending}
        onSubmit={() => void submit()}
      >
        <Field label="Code" htmlFor="chain-code" hint="Unique across chains, as used by exchanges.">
          <Input
            id="chain-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ETH"
            autoFocus
          />
        </Field>
        <Field label="Name" htmlFor="chain-name">
          <Input
            id="chain-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ethereum"
          />
        </Field>
        {canSubmit ? null : <p className="text-xs text-muted-foreground">Code and name are both required.</p>}
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={removing === null ? "Remove chain" : `Remove ${removing.code}?`}
        description="Markets linked to this chain lose the link, and routes through it disappear."
        confirmLabel="Remove chain"
        pending={pending}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}
