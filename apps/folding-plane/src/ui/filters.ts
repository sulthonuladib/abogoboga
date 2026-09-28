import { Checkbox, RadioGroup, Select } from '@foldkit/ui'
import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// STYLE

const compactSelectClass =
  'h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

const checkBoxClass =
  'flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-[background-color,border-color] duration-[var(--duration-instant)] ease-[var(--ease-app)] data-[checked]:border-primary data-[checked]:bg-primary'

const checkMarkClass = 'text-[10px] leading-none text-primary-foreground'

const checkLabelClass = 'select-none text-sm'

const barClass =
  'flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-[var(--shadow-border)]'

const rowClass = 'flex flex-wrap items-center gap-2 sm:gap-3'

const statusClass = 'ml-auto text-xs tabular-nums text-muted-foreground'

const segmentClass = 'flex flex-wrap items-center gap-1'

const segmentButtonClass =
  'rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground outline-none transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-muted data-[checked]:font-medium data-[checked]:text-foreground'

const checkRowClass = 'flex cursor-pointer items-center gap-1.5'

const checksClass = 'flex flex-wrap items-center gap-x-4 gap-y-1.5'

const checksLabelClass = 'text-xs text-muted-foreground'

const clearClass =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-[scale,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40'

// BAR

/**
 * The toolbar a listing's filters sit in: a compact search beside its
 * facets, a grouped row of search fields, and the result status. One card
 * holds the whole query, so the table below always answers to the controls
 * directly above it.
 */
export function filterBar<Message>(
  h: HtmlBuilder<Message>,
  rows: ReadonlyArray<Html>,
): Html {
  return h.div([h.Class(barClass)], rows)
}

export function filterRow<Message>(
  h: HtmlBuilder<Message>,
  controls: ReadonlyArray<Html>,
): Html {
  return h.div([h.Class(rowClass)], controls)
}

export function filterStatus<Message>(
  h: HtmlBuilder<Message>,
  text: string,
): Html {
  return h.p([h.Class(statusClass)], [text])
}

/**
 * A labelled-by-aria select for a filter that sits beside search. Lighter
 * than a labelled field because the value reads as the filter itself, the
 * way the rows-per-page choice does.
 */
export function filterSelect<Message>(
  input: Readonly<{
    id: string
    label: string
    value: string
    choices: ReadonlyArray<Readonly<{ value: string, label: string }>>
    onChange: (value: string) => Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  return Select.view(
    {
      id: input.id,
      value: input.value,
      onChange: input.onChange,
      isInvalid: false,
      toView: (attributes) =>
        input.h.select(
          [
            ...attributes.select,
            input.h.AriaLabel(input.label),
            input.h.Class(compactSelectClass),
          ],
          input.choices.map((choice) =>
            input.h.option([input.h.Value(choice.value)], [choice.label]),
          ),
        ),
    },
    input.h,
  )
}

// SEARCH FIELDS

/**
 * The fields a listing's search matches, as one wrapping row beside the
 * search box: a quiet lead label and a checkbox with a real check state for
 * each field. Each toggle is a navigation, so the URL always says which
 * fields are in play. The group carries its own name because the bar holds
 * several groups and a bare run of checkboxes would blur together.
 */
export function searchFieldChecks<Message, Field extends string>(
  input: Readonly<{
    label: string
    choices: ReadonlyArray<Readonly<{ field: Field, label: string }>>
    selected: ReadonlyArray<Field>
    onToggle: (field: Field, isChecked: boolean) => Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  return input.h.div(
    [input.h.Class(checksClass), input.h.Role('group'), input.h.AriaLabel(input.label)],
    [
      input.h.span([input.h.Class(checksLabelClass)], [input.label]),
      ...input.choices.map((choice) => {
        const isChecked = input.selected.includes(choice.field)

        return Checkbox.view(
          {
            id: `search-field-${choice.field}`,
            isChecked,
            onToggle: (nextChecked) => input.onToggle(choice.field, nextChecked),
            toView: (attributes) =>
              input.h.div([input.h.Class(checkRowClass)], [
                isChecked
                  ? input.h.button(
                    [...attributes.checkbox, input.h.Class(checkBoxClass)],
                    [input.h.span([input.h.Class(checkMarkClass)], ['✓'])],
                  )
                  : input.h.button([...attributes.checkbox, input.h.Class(checkBoxClass)]),
                input.h.label(
                  [...attributes.label, input.h.Class(checkLabelClass)],
                  [choice.label],
                ),
              ]),
          },
          input.h,
        )
      }),
    ],
  )
}

// RADIO

/**
 * One choice among a few, as a row of radio pills with arrow-key navigation.
 * For facets with short labels — coverage, scope kind, sort direction —
 * where a select would hide the options. The selection stays parent-owned
 * (the URL query), so the group is a controlled `RadioGroup`: it only holds
 * the roving-tabindex cursor while the parent holds the value.
 */
export function filterRadio<Message, Value extends string>(
  input: Readonly<{
    bundle: RadioGroup.Bundle<Value>
    model: RadioGroup.Model
    options: ReadonlyArray<Readonly<{ value: Value, label: string }>>
    selected: Value
    label: string
    toParentMessage: (message: RadioGroup.Message) => Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  const { h } = input

  const labelOf = (value: Value): string =>
    Option.match(Array.findFirst(input.options, (option) => option.value === value), {
      onNone: () => value,
      onSome: ({ label }) => label,
    })

  return h.submodel({
    slotId: input.model.id,
    model: input.model,
    view: input.bundle.view,
    viewInputs: {
      options: input.options.map((option) => option.value),
      selectedValue: Option.some(input.selected),
      ariaLabel: input.label,
      orientation: 'Horizontal',
      toView: ({ group, options }) =>
        h.div([...group, h.Class(segmentClass)], options.map((option) =>
          h.button([...option.option, h.Class(segmentButtonClass)], [
            h.span([...option.label], [labelOf(option.value)]),
          ]))),
    },
    toParentMessage: input.toParentMessage,
  })
}

// CLEAR

/**
 * The way out of the facets. Clearing keeps the search text and the page
 * size — those are the operator's context, not facets — and resets
 * everything the bar owns. Dead while nothing is active so the state reads
 * without clicking.
 */
export function clearFilters<Message>(
  input: Readonly<{
    activeCount: number
    onClear: Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  return input.h.button(
    [
      input.h.Type('button'),
      input.activeCount === 0
        ? input.h.Disabled(true)
        : input.h.OnClick(input.onClear),
      input.h.AriaLabel(
        input.activeCount === 0 ? 'Clear filters' : `Clear ${input.activeCount} filters`,
      ),
      input.h.Class(clearClass),
    ],
    ['Clear'],
  )
}

// PAGE SIZE

/**
 * The rows-per-page choice, small enough to sit beside the pager. The current
 * value comes from the URL, and a change is a navigation.
 */
export function pageSizeSelect<Message>(
  input: Readonly<{
    id: string
    value: number
    choices: ReadonlyArray<number>
    onChange: (value: number) => Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  return Select.view(
    {
      id: input.id,
      value: String(input.value),
      onChange: (value) => input.onChange(Number(value)),
      isInvalid: false,
      toView: (attributes) =>
        input.h.select(
          [
            ...attributes.select,
            input.h.AriaLabel('Rows per page'),
            input.h.Class(compactSelectClass),
          ],
          input.choices.map((size) =>
            input.h.option([input.h.Value(String(size))], [`${size} rows`]),
          ),
        ),
    },
    input.h,
  )
}
