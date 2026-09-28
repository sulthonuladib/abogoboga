import { Input } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// PICKER SEARCH

const pickerControlClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * A search box inside a picker dialog. Unlike the listing search, it carries
 * an accessible name so two pickers on one page can be told apart when both
 * dialogs are open.
 */
export const pickerSearch = <M>(
  input: Readonly<{
    id: string
    label: string
    value: string
    placeholder: string
    onInput: (value: string) => M
    h: HtmlBuilder<M>
  }>,
): Html =>
  Input.view(
    {
      id: input.id,
      value: input.value,
      onInput: input.onInput,
      type: 'search',
      placeholder: input.placeholder,
      toView: (attributes) =>
        input.h.div([input.h.Class('w-full')], [
          input.h.input([
            ...attributes.input,
            input.h.AriaLabel(input.label),
            input.h.Class(pickerControlClass),
          ]),
        ]),
    },
    input.h,
  )
