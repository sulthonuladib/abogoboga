import { Checkbox, Select } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// STYLE

const compactSelectClass =
  'h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

const checkboxClass = 'size-3.5 accent-primary'

// SEARCH FIELDS

/**
 * A fieldset of checkboxes naming the fields a listing's search matches. Each
 * toggle is a navigation, so the URL always says which fields are in play.
 */
export function searchFieldsField<Message, Field extends string>(
  input: Readonly<{
    legend: string
    choices: ReadonlyArray<Readonly<{ field: Field, label: string }>>
    selected: ReadonlyArray<Field>
    onToggle: (field: Field, isChecked: boolean) => Message
    h: HtmlBuilder<Message>
  }>,
): Html {
  return input.h.fieldset(
    [input.h.Class('flex flex-wrap items-center gap-x-3 gap-y-1')],
    [
      input.h.legend([input.h.Class('text-xs font-medium')], [input.legend]),
      ...input.choices.map((choice) =>
        Checkbox.view(
          {
            id: `search-field-${choice.field}`,
            isChecked: input.selected.includes(choice.field),
            onToggle: (isChecked) => input.onToggle(choice.field, isChecked),
            toView: (attributes) =>
              input.h.div([input.h.Class('flex items-center gap-1.5')], [
                input.h.input([
                  ...attributes.checkbox,
                  input.h.Class(checkboxClass),
                ]),
                input.h.label(
                  [...attributes.label, input.h.Class('text-xs')],
                  [choice.label],
                ),
              ]),
          },
          input.h,
        )
      ),
    ],
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
