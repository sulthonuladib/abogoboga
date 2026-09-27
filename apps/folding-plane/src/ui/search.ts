import { Input } from '@foldkit/ui'
import { Duration } from 'effect'
import { type Html, type HtmlBuilder } from 'foldkit/html'

// SEARCH

/**
 * How long a search waits for a pause in typing. A listing's search Command
 * is interruptible by name, so the next keystroke stops the pending one instead
 * of racing it, and only the last wait reaches the URL.
 */
export const searchDelay = Duration.millis(250)

const controlClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * The search box above a listing.
 */
export const searchField = <Message>(
  input: Readonly<{
    id: string
    value: string
    placeholder: string
    onInput: (value: string) => Message
    h: HtmlBuilder<Message>
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
        input.h.div([input.h.Class('w-full sm:max-w-xs')], [
          input.h.input([...attributes.input, input.h.Class(controlClass)]),
        ]),
    },
    input.h,
  )
