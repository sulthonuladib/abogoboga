import { Field as FieldRoot, FieldDescription, FieldLabel } from "@lister/ui/components/field"
import type { ReactNode } from "react"

/**
 * Labelled form field built from the shadcn field primitives.
 *
 * The label is associated with the control by id so every input keeps an
 * accessible name.
 */
export const Field = (props: {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: ReactNode | undefined
  readonly children: ReactNode
}) => (
  <FieldRoot>
    <FieldLabel htmlFor={props.htmlFor}>{props.label}</FieldLabel>
    {props.children}
    {props.hint === undefined ? null : <FieldDescription>{props.hint}</FieldDescription>}
  </FieldRoot>
)
