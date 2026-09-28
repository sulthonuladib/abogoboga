import { Dialog } from '@foldkit/ui'
import { type Html, type HtmlBuilder } from 'foldkit/html'

import { classNames } from './classNames'

// STYLE

/**
 * The three sizes a dialog panel takes. A destructive confirmation is compact,
 * an editor fits its form, and a picker fits the list it searches without
 * crowding the viewport.
 */
export type Size = 'sm' | 'md' | 'lg'

const baseDialogClass = 'fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto'

const sizeClass: Record<Size, string> = {
  sm: 'w-[min(24rem,calc(100vw-2rem))]',
  md: 'w-[min(32rem,calc(100vw-2rem))]',
  lg: 'w-[min(40rem,calc(100vw-2rem))]',
}

const backdropClass = 'fixed inset-0 bg-foreground/40'

const panelClass =
  'relative rounded-3xl bg-card p-5 text-card-foreground shadow-[var(--shadow-border)]'

const titleClass = 'text-base font-semibold'

const descriptionClass = 'mt-1 text-sm text-muted-foreground'

const closeClass =
  'absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[scale,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:text-foreground'

const contentClass = 'mt-4 flex flex-col gap-4'

const footerClass = 'mt-5 flex flex-wrap items-center justify-end gap-2'

const destructiveClass =
  'rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[scale,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-destructive/90'

const primaryClass =
  'rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-[scale,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-primary/90'

const secondaryClass =
  'rounded-lg bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-border)] transition-[scale,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-app)] active:scale-[0.96] hover:bg-muted hover:shadow-[var(--shadow-border-hover)]'

const confirmButton = <Message>(
  input: Readonly<{
    label: string
    h: HtmlBuilder<Message>
    onConfirm: Message
    isDestructive: boolean
    isDisabled: boolean
  }>,
): Html => {
  const { h } = input
  const tone = input.isDestructive ? destructiveClass : primaryClass

  return h.button(
    [
      h.Type('button'),
      input.isDisabled ? h.Disabled(true) : h.OnClick(input.onConfirm),
      h.Class(
        classNames(tone, input.isDisabled && 'cursor-not-allowed opacity-50'),
      ),
    ],
    [input.label],
  )
}

/**
 * A modal dialog with a title, one sentence of context, a body the caller
 * builds, and a footer.
 *
 * The dialog owns its open state and focus; the page owns what closing it means
 * for the rest of the Model, which is what `toParentMessage` carries. The close
 * and cancel controls use the dialog's own attribute bundles, so they close the
 * dialog through the same path a click on the backdrop takes.
 */
export const dialog = <Message>(
  input: Readonly<{
    model: Dialog.Model
    title: string
    description?: string | undefined
    isDestructive?: boolean | undefined
    size?: Size | undefined
    confirmLabel?: string | undefined
    isConfirmDisabled?: boolean | undefined
    onConfirm?: Message | undefined
    toParentMessage: (message: Dialog.Message) => Message
    content: Html
    h: HtmlBuilder<Message>
  }>,
): Html => {
  const size = input.size ?? 'md'

  return input.h.submodel({
    slotId: input.model.id,
    model: input.model,
    view: Dialog.view,
    viewInputs: {
      hasDescription: input.description !== undefined,
      toView: (render) =>
        input.h.dialog([...render.dialog, input.h.Class(classNames(baseDialogClass, sizeClass[size])), input.h.DataAttribute('size', size)], [
          input.h.div([...render.backdrop, input.h.Class(backdropClass)]),
          input.h.div([...render.panel, input.h.Class(panelClass)], [
            input.h.button(
              [
                ...render.closeButton,
                input.h.Type('button'),
                input.h.Class(closeClass),
                input.h.AriaLabel('Close'),
              ],
              ['✕'],
            ),
            input.h.h2(
              [
                ...render.title,
                input.h.Id(Dialog.titleId(input.model)),
                input.h.Class(titleClass),
              ],
              [input.title],
            ),
            input.description === undefined
              ? input.h.empty
              : input.h.p(
                [
                  ...render.description,
                  input.h.Id(Dialog.descriptionId(input.model)),
                  input.h.Class(descriptionClass),
                ],
                [input.description],
              ),
            input.h.div([input.h.Class(contentClass)], [input.content]),
            input.h.div([input.h.Class(footerClass)], [
              input.h.button(
                [...render.closeButton, input.h.Type('button'), input.h.Class(secondaryClass)],
                ['Cancel'],
              ),
              input.onConfirm === undefined
                ? input.h.empty
                : confirmButton({
                  label: input.confirmLabel ?? 'Save',
                  h: input.h,
                  onConfirm: input.onConfirm,
                  isDestructive: input.isDestructive === true,
                  isDisabled: input.isConfirmDisabled === true,
                }),
            ]),
          ]),
        ]),
    },
    toParentMessage: input.toParentMessage,
  })
}
