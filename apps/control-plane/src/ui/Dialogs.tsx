import { Button } from "@lister/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@lister/ui/components/dialog"
import type { FormEvent, ReactNode } from "react"

/**
 * Dialog wrapping a create/edit form.
 *
 * Submission runs the page's mutation; the dialog stays open while it is
 * pending and closes only after the mutation reports success.
 */
export const FormDialog = (props: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description?: string | undefined
  readonly submitLabel: string
  readonly pending: boolean
  readonly onSubmit: () => void
  readonly children: ReactNode
}) => (
  <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          props.onSubmit()
        }}
      >
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description === undefined ? null : <DialogDescription>{props.description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-4">{props.children}</div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={props.pending}>
            {props.pending ? "Saving…" : props.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
)

/**
 * Confirmation dialog for destructive actions.
 *
 * The description states the consequence; the confirm button names the action
 * instead of saying "OK".
 */
export const ConfirmDialog = (props: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly pending: boolean
  readonly onConfirm: () => void
}) => (
  <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="button" variant="destructive" disabled={props.pending} onClick={props.onConfirm}>
          {props.pending ? "Working…" : props.confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
