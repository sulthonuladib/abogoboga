import { type Field, isInvalid, match } from 'foldkit/fieldValidation'
import { Checkbox, Input, Select } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// STYLE

const fieldClass = 'flex flex-col gap-1.5'

const labelClass = 'text-xs font-medium'

const noteClass = 'text-xs text-muted-foreground'

const controlClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

const invalidControlClass = 'border-destructive focus-visible:ring-destructive'

const errorClass = 'text-xs text-destructive'

// FIELD

const errorsOf = <A>(field: Field<A>): ReadonlyArray<string> =>
  match(field, {
    onNotValidated: () => [],
    onValidating: () => [],
    onValid: () => [],
    onInvalid: ({ errors }) => errors,
  })

const controlClassFor = <A>(field: Field<A>): string =>
  match(field, {
    onNotValidated: () => controlClass,
    onValidating: () => controlClass,
    onValid: () => controlClass,
    onInvalid: () => `${controlClass} ${invalidControlClass}`,
  })

/**
 * A label, a control, and one note under it. The note carries the hint until the
 * field has something to say, then the reason the value was rejected. It is
 * the element the control's `aria-describedby` points at, so a screen reader
 * reads the same sentence the page shows.
 */
const fieldShell = <Message>(
  input: Readonly<{
    id: string
    label: string
    note: string
    isInvalid: boolean
    control: Html
    h: HtmlBuilder<Message>
  }>,
): Html =>
  input.h.div([input.h.Class(fieldClass)], [
    input.h.label(
      [input.h.For(input.id), input.h.Class(labelClass)],
      [input.label],
    ),
    input.control,
    input.note === ''
      ? input.h.empty
      : input.h.p(
        [
          input.h.Id(`${input.id}-description`),
          input.h.Class(input.isInvalid ? errorClass : noteClass),
        ],
        [input.note],
      ),
  ])

const noteFor = <A>(field: Field<A>, hint: string | undefined): string => {
  const errors = errorsOf(field)

  if (errors.length > 0) {
    return errors.join(' ')
  }

  return hint ?? ''
}

// TEXT

/**
 * A labelled text input. The field's own state decides the border and the note
 * under it, so a form reads the same whether a value was rejected by a rule or
 * by the server.
 */
export const textField = <Message>(
  input: Readonly<{
    id: string
    label: string
    field: Field<string>
    hint?: string | undefined
    placeholder?: string | undefined
    isAutofocus?: boolean | undefined
    onInput: (value: string) => Message
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Input.view(
    {
      id: input.id,
      value: input.field.value,
      onInput: input.onInput,
      isInvalid: isInvalid(input.field),
      hasDescription: noteFor(input.field, input.hint) !== '',
      isAutofocus: input.isAutofocus === true,
      placeholder: input.placeholder ?? '',
      toView: (attributes) =>
        fieldShell({
          id: input.id,
          label: input.label,
          note: noteFor(input.field, input.hint),
          isInvalid: isInvalid(input.field),
          h: input.h,
          control: input.h.input([
            ...attributes.input,
            input.h.Class(controlClassFor(input.field)),
          ]),
        }),
    },
    input.h,
  )

// CHOICE

export type Choice = Readonly<{ value: string, label: string }>

/**
 * A labelled select. The options are the caller's, so a filter shows the same
 * wording the query uses for each value.
 */
export const selectField = <Message>(
  input: Readonly<{
    id: string
    label: string
    value: string
    choices: ReadonlyArray<Choice>
    hint?: string | undefined
    isInvalid?: boolean | undefined
    onChange: (value: string) => Message
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Select.view(
    {
      id: input.id,
      value: input.value,
      onChange: input.onChange,
      isInvalid: input.isInvalid === true,
      toView: (attributes) =>
        fieldShell({
          id: input.id,
          label: input.label,
          note: input.hint ?? '',
          isInvalid: input.isInvalid === true,
          h: input.h,
          control: input.h.select(
            [
              ...attributes.select,
              input.h.Class(input.isInvalid === true ? invalidControlClass : controlClass),
            ],
            input.choices.map((choice) =>
              input.h.option([input.h.Value(choice.value)], [choice.label]),
            ),
          ),
        }),
    },
    input.h,
  )

// TOGGLE

const checkBoxClass =
  'flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-[background-color,border-color] duration-[var(--duration-instant)] ease-[var(--ease-app)] data-[checked]:border-primary data-[checked]:bg-primary'

const checkMarkClass = 'text-[10px] leading-none text-primary-foreground'

/**
 * The box behind every checkbox in the app: an empty bordered square that
 * fills with a check while checked. One renderer so a flag reads the same
 * in a form, a filter row, and a link list.
 */
export const checkControl = <Message>(
  attributes: Checkbox.CheckboxAttributes<Message>,
  isChecked: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  isChecked
    ? h.button(
      [...attributes.checkbox, h.Class(checkBoxClass)],
      [h.span([h.Class(checkMarkClass)], ['✓'])],
    )
    : h.button([...attributes.checkbox, h.Class(checkBoxClass)])

/**
 * A labelled checkbox for a flag the scanner reads.
 */
export const toggleField = <Message>(
  input: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Checkbox.view(
    {
      id: input.id,
      isChecked: input.isChecked,
      onToggle: input.onToggle,
      toView: (attributes) =>
        input.h.div([input.h.Class('flex items-center gap-2')], [
          checkControl(attributes, input.isChecked, input.h),
          input.h.label(
            [...attributes.label, input.h.Class('text-sm')],
            [input.label],
          ),
        ]),
    },
    input.h,
  )

/**
 * A compact checkbox for a table or list row, where a full field would
 * crowd the row. Same box as the field, smaller label, tighter gaps.
 */
export const inlineCheck = <Message>(
  input: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
    h: HtmlBuilder<Message>
  }>,
): Html =>
  Checkbox.view(
    {
      id: input.id,
      isChecked: input.isChecked,
      onToggle: input.onToggle,
      toView: (attributes) =>
        input.h.div([input.h.Class('flex cursor-pointer items-center gap-1.5')], [
          checkControl(attributes, input.isChecked, input.h),
          input.h.label(
            [...attributes.label, input.h.Class('text-xs')],
            [input.label],
          ),
        ]),
    },
    input.h,
  )
