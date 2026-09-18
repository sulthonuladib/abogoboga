/**
 * Not-found page body.
 *
 * @module
 */

import { html, type RawHtml } from "../Html.ts"
import { PageHeader } from "./Controls.ts"

/**
 * Renders the `/not-found` body with optional request context.
 *
 * @param options - Optional origin, kind, and id describing the miss.
 * @returns The not-found fragment.
 */
export const NotFoundBody = (options: {
  readonly from?: string | undefined
  readonly kind?: string | undefined
  readonly id?: string | undefined
}): RawHtml =>
  html`<div>
    ${PageHeader({ title: "Not found", subtitle: "The requested entity does not exist." })}
    <div class="alert alert-warning">
      <span>
        ${options.kind === undefined ? "Nothing" : options.kind} ${options.id === undefined ? "" : `#${options.id}`} was not found${options.from === undefined ? "." : ` (from ${options.from}).`}
      </span>
    </div>
    <div class="mt-3 flex gap-2">
      <a class="btn btn-ghost btn-sm" href="/dashboard" hx-get="/dashboard" hx-target="#main-content" hx-swap="innerHTML show:top" hx-push-url="true">← Dashboard</a>
      ${options.from === undefined
        ? ""
        : html`<a
          class="btn btn-primary btn-sm"
          href="${options.from}"
          hx-get="${options.from}"
          hx-target="#main-content"
          hx-swap="innerHTML show:top"
          hx-push-url="true"
          >Back</a
        >`}
    </div>
  </div>`
