import { Alert, AlertAction, AlertDescription, AlertTitle } from "@lister/ui/components/alert"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@lister/ui/components/empty"
import { Button } from "@lister/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@lister/ui/components/tooltip"
import { WarningCircleIcon, type Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

/**
 * Empty-state block for listings with no rows.
 */
export const EmptyState = (props: {
  readonly icon?: Icon | undefined
  readonly title: string
  readonly description: string
  readonly action?: ReactNode | undefined
}) => (
  <Empty>
    <EmptyHeader>
      {props.icon === undefined ? null : (
        <EmptyMedia variant="icon">
          <props.icon />
        </EmptyMedia>
      )}
      <EmptyTitle>{props.title}</EmptyTitle>
      <EmptyDescription>{props.description}</EmptyDescription>
    </EmptyHeader>
    {props.action === undefined ? null : <EmptyContent>{props.action}</EmptyContent>}
  </Empty>
)

/**
 * Load-failure notice with an optional retry action.
 */
export const ErrorAlert = (props: {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode | undefined
}) => (
  <Alert variant="destructive">
    <WarningCircleIcon weight="fill" />
    <AlertTitle>{props.title}</AlertTitle>
    <AlertDescription>{props.description}</AlertDescription>
    {props.action === undefined ? null : <AlertAction>{props.action}</AlertAction>}
  </Alert>
)

/**
 * Retry button shared by load-failure notices.
 */
export const RetryButton = (props: { readonly onRetry: () => void }) => (
  <Button variant="outline" size="sm" onClick={props.onRetry}>
    Retry
  </Button>
)

/**
 * Icon-only action with a tooltip label.
 *
 * The label is also the accessible name, so the control works with a screen
 * reader and a pointer alike.
 */
export const IconAction = (props: {
  readonly label: string
  readonly onClick: () => void
  readonly disabled?: boolean | undefined
  readonly children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={props.label}
          onClick={props.onClick}
          disabled={props.disabled === true}
        >
          {props.children}
        </Button>
      }
    />
    <TooltipContent>{props.label}</TooltipContent>
  </Tooltip>
)
