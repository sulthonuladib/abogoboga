import { InputGroup, InputGroupAddon, InputGroupInput } from "@lister/ui/components/input-group"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { cn } from "@lister/ui"

/**
 * Search input built from the shadcn input group.
 *
 * Pages debounce the value before turning it into a query so typing stays
 * cheap; this component only renders the field.
 */
export const SearchField = (props: {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly placeholder: string
  readonly className?: string | undefined
  readonly "aria-label"?: string | undefined
}) => (
  <InputGroup className={cn("w-full sm:max-w-xs", props.className)}>
    <InputGroupAddon align="inline-start">
      <MagnifyingGlassIcon className="size-4" />
    </InputGroupAddon>
    <InputGroupInput
      type="search"
      value={props.value}
      onChange={(event) => props.onValueChange(event.target.value)}
      placeholder={props.placeholder}
      aria-label={props["aria-label"] ?? props.placeholder}
    />
  </InputGroup>
)
