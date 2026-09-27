import { useAtomValue } from "@effect/atom-react"
import { type CursorPosition, decodeCursor } from "@lister/api/client"
import { Button } from "@lister/ui/components/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus
} from "@lister/ui/components/combobox"
import { PlusIcon } from "@phosphor-icons/react"
import { AsyncResult, type Atom } from "effect/unstable/reactivity"
import { Option } from "effect"
import { useCallback, useEffect, useState } from "react"
import { useDebouncedValue } from "../lib/hooks.ts"

/**
 * Searchable, cursor-paginated lookup control.
 *
 * Rows load a keyset page at a time: the first page when the popup opens or
 * the search changes, and the next page when the list is scrolled near its
 * end. Every page is fetched by its own atom keyed by the decoded cursor, and
 * pages merge in order so the list never repeats or reorders rows.
 *
 * @module
 */

/** Display projection of one lookup row. */
export type LookupOption = {
  /** Value shown in the input once the row is selected. */
  readonly label: string
  /** Primary text of the list row. */
  readonly title: string
  /** Secondary text of the list row. */
  readonly subtitle: string
}

/** One keyset page of lookup rows. */
export type LookupPage<Item> = {
  readonly data: ReadonlyArray<Item>
  readonly nextCursor?: string | null | undefined
}

/** Where a lookup control loads its rows from. */
export type LookupSource<Item extends { readonly id: number }> = {
  /** Query atom for one page of rows. */
  readonly listAtom: (input: {
    readonly search: string
    readonly cursor: CursorPosition | undefined
  }) => Atom.Atom<AsyncResult.AsyncResult<LookupPage<Item>, unknown>>
  /** Display projection of one row. */
  readonly toOption: (item: Item) => LookupOption
}

type LookupState<Item> = {
  readonly search: string
  readonly cursor: CursorPosition | undefined
  readonly rows: ReadonlyArray<Item>
  readonly nextCursor: CursorPosition | null
  readonly loaded: ReadonlySet<string>
}

const emptyState = <Item,>(search: string): LookupState<Item> => ({
  search,
  cursor: undefined,
  rows: [],
  nextCursor: null,
  loaded: new Set()
})

const cursorKey = (cursor: CursorPosition | undefined): string =>
  cursor === undefined ? "first" : `${cursor.orderBy}:${cursor.direction}:${cursor.values.join("|")}`

/**
 * Searchable lookup control with infinite scroll.
 *
 * @template Item - Row type; must carry a numeric id for selection identity.
 */
export const LookupSelect = <Item extends { readonly id: number }>(props: {
  readonly source: LookupSource<Item>
  readonly label: string
  readonly htmlFor: string
  readonly placeholder: string
  readonly emptyMessage: string
  readonly value: Item | null
  readonly onValueChange: (item: Item | null) => void
  readonly disabled?: boolean | undefined
  /** When set, renders an inline create action for the typed text. */
  readonly onCreate?:
    | {
        readonly label: (search: string) => string
        readonly run: (search: string) => Promise<Item | undefined>
      }
    | undefined
}) => {
  const { source, onCreate } = props

  const [inputValue, setInputValue] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [state, setState] = useState<LookupState<Item>>(() => emptyState(""))

  const debouncedInput = useDebouncedValue(inputValue, 200)

  const selectedLabel = props.value === null ? "" : source.toOption(props.value).label
  const query = debouncedInput === selectedLabel ? "" : debouncedInput

  // A search change immediately reads the first page of the new search; the
  // stored cursor is never paired with a different query.
  const activeCursor = state.search === query ? state.cursor : undefined
  const page = useAtomValue(source.listAtom({ search: query, cursor: activeCursor }))
  const waiting = AsyncResult.isInitial(page) || AsyncResult.isWaiting(page)

  useEffect(() => {
    setState((current) => (current.search === query ? current : emptyState(query)))
  }, [query])

  useEffect(() => {
    if (!AsyncResult.isSuccess(page)) return

    const result = page.value
    const key = `${query}|${cursorKey(activeCursor)}`

    setState((current) => {
      if (current.search !== query || current.loaded.has(key)) return current

      return {
        search: current.search,
        cursor: current.cursor,
        rows: [...current.rows, ...result.data],
        nextCursor: Option.getOrNull(decodeCursor(result.nextCursor ?? "")),
        loaded: new Set(current.loaded).add(key)
      }
    })
  }, [page, query, activeCursor])

  const loadMore = useCallback(() => {
    if (waiting) return

    setState((current) => {
      if (current.nextCursor === null || current.cursor === current.nextCursor) return current

      return { ...current, cursor: current.nextCursor }
    })
  }, [waiting])

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget

      if (element.scrollHeight - element.scrollTop - element.clientHeight < 64) loadMore()
    },
    [loadMore]
  )

  const select = useCallback(
    (item: Item | null) => {
      props.onValueChange(item)
      setInputValue(item === null ? "" : source.toOption(item).label)
    },
    [props, source]
  )

  const create = useCallback(async () => {
    if (onCreate === undefined || query.trim() === "") return

    setCreating(true)

    const created = await onCreate.run(query.trim())

    setCreating(false)

    if (created !== undefined) {
      select(created)
      setOpen(false)
    }
  }, [onCreate, query, select])

  const items = props.value === null || state.rows.some((row) => row.id === props.value?.id)
    ? state.rows
    : [...state.rows, props.value]

  const status = waiting
    ? query === ""
      ? "Loading…"
      : "Searching…"
    : AsyncResult.isFailure(page)
    ? "Could not load rows. Try again."
    : null

  return (
    <Combobox
      items={items}
      value={props.value}
      onValueChange={(item: Item | null) => select(item)}
      inputValue={inputValue}
      onInputValueChange={(next, details) => {
        if (details.reason === "item-press") return

        setInputValue(next)
      }}
      open={open}
      onOpenChange={(next) => setOpen(next)}
      onOpenChangeComplete={(next) => {
        if (!next) setInputValue(props.value === null ? "" : source.toOption(props.value).label)
      }}
      isItemEqualToValue={(item, value) => item.id === value.id}
      itemToStringLabel={(item: Item) => source.toOption(item).label}
      filter={null}
      disabled={props.disabled === true}
    >
      <ComboboxInput
        id={props.htmlFor}
        placeholder={props.placeholder}
        showClear
        aria-label={props.label}
        disabled={props.disabled === true}
      />
      <ComboboxContent>
        <ComboboxStatus>{status}</ComboboxStatus>
        <ComboboxEmpty>{query === "" ? props.emptyMessage : `No matches for “${query}”.`}</ComboboxEmpty>
        <ComboboxList onScroll={onScroll}>
          {(item: Item) => {
            const option = source.toOption(item)

            return (
              <ComboboxItem key={item.id} value={item}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{option.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{option.subtitle}</span>
                </span>
              </ComboboxItem>
            )
          }}
        </ComboboxList>
        {onCreate === undefined || query.trim() === "" ? null : (
          <div className="border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={creating}
              onClick={() => void create()}
            >
              <PlusIcon data-icon="inline-start" />
              {creating ? "Adding…" : onCreate.label(query.trim())}
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
