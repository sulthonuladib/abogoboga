/**
 * Shared view controls: page headers, modals, form fields, and pagination.
 *
 * @module
 */

import { html, join, raw, type RawHtml } from "../Html.ts"
import { ErrorFragment } from "../Fragments.ts"

/**
 * Page title with an optional count badge and action buttons.
 *
 * @param options - Title, subtitle, count badge, and actions.
 * @returns The header fragment.
 */
export const PageHeader = (options: {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly count?: { readonly id: string; readonly label: string } | undefined
  readonly actions?: RawHtml | undefined
}): RawHtml =>
  html`<div class="mb-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight">
          ${options.title}
          ${options.count === undefined
            ? ""
            : html`<span id="${options.count.id}" class="badge badge-neutral">${options.count.label}</span>`}
        </h1>
        ${options.subtitle === undefined ? "" : html`<p class="mt-1 max-w-2xl text-sm opacity-70">${options.subtitle}</p>`}
      </div>
      ${options.actions === undefined ? "" : html`<div class="flex flex-wrap items-center gap-2">${options.actions}</div>`}
    </div>
  </div>`

/**
 * Native dialog modal shell swapped into `#modal-slot`.
 *
 * @param options - Dialog title, optional subtitle and error, and body markup.
 * @returns The modal fragment.
 */
export const Modal = (options: {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly error?: string | undefined
  readonly children: RawHtml
}): RawHtml =>
  html`<div id="modal-slot">
    <dialog open id="app-modal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold">${options.title}</h3>
            ${options.subtitle === undefined ? "" : html`<p class="mt-1 text-sm opacity-70">${options.subtitle}</p>`}
          </div>
          <form method="dialog">
            <button type="submit" class="btn btn-circle btn-ghost btn-sm" aria-label="Close dialog">✕</button>
          </form>
        </div>
        ${options.error === undefined ? "" : ErrorFragment({ message: options.error })}
        ${options.children}
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Close dialog">close</button></form>
    </dialog>
  </div>`

/**
 * Labeled form field.
 *
 * @param options - Field label, optional hint, and control markup.
 * @returns The field fragment.
 */
export const Field = (options: {
  readonly label: string
  readonly hint?: string | undefined
  readonly children: RawHtml
}): RawHtml =>
  html`<label class="form-control w-full">
    <div class="label py-1">
      <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">${options.label}</span>
    </div>
    ${options.children}
    ${options.hint === undefined
      ? ""
      : html`<div class="label py-1"><span class="label-text-alt opacity-60">${options.hint}</span></div>`}
  </label>`

/**
 * Single-line text input.
 *
 * @param options - Input name, value, type, and validation hints.
 * @returns The input fragment.
 */
export const TextInput = (options: {
  readonly name: string
  readonly value?: string | undefined
  readonly type?: string | undefined
  readonly placeholder?: string | undefined
  readonly required?: boolean | undefined
  readonly min?: number | undefined
  readonly max?: number | undefined
}): RawHtml =>
  html`<input
    class="input input-bordered input-sm w-full"
    type="${options.type ?? "text"}"
    name="${options.name}"
    value="${options.value ?? ""}"
    placeholder="${options.placeholder ?? ""}"
    ${options.required === true ? raw("required") : ""}
    ${options.min === undefined ? "" : raw(`min="${options.min}"`)}
    ${options.max === undefined ? "" : raw(`max="${options.max}"`)}
  />`

/**
 * Checkbox input with an inline label.
 *
 * @param options - Input name, label, and checked state.
 * @returns The checkbox fragment.
 */
export const Checkbox = (options: {
  readonly name: string
  readonly label: string
  readonly checked: boolean
}): RawHtml =>
  html`<label class="label cursor-pointer justify-start gap-2 py-1">
    <input type="checkbox" name="${options.name}" class="checkbox checkbox-sm" ${options.checked ? raw("checked") : ""} />
    <span class="label-text text-sm">${options.label}</span>
  </label>`

/**
 * Select input.
 *
 * @param options - Input name, choices, and the currently selected value.
 * @returns The select fragment.
 */
export const Select = (options: {
  readonly name: string
  readonly choices: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly selected?: string | undefined
  readonly placeholder?: string | undefined
}): RawHtml =>
  html`<select name="${options.name}" class="select select-bordered select-sm w-full">
    ${options.placeholder === undefined
      ? ""
      : html`<option value="">${options.placeholder}</option>`}
    ${join(
      options.choices.map((choice) =>
        html`<option value="${choice.value}" ${options.selected === choice.value ? raw("selected") : ""}>${choice.label}</option>`
      )
    )}
  </select>`

/**
 * Friendly empty state for tables and lists.
 *
 * @param options - Title, hint, and optional action markup.
 * @returns The empty-state fragment.
 */
export const EmptyState = (options: {
  readonly title: string
  readonly hint?: string | undefined
  readonly actions?: RawHtml | undefined
}): RawHtml =>
  html`<div class="flex flex-col items-center gap-1 px-6 py-10 text-center">
    <p class="font-semibold">${options.title}</p>
    ${options.hint === undefined ? "" : html`<p class="text-sm opacity-60">${options.hint}</p>`}
    ${options.actions === undefined ? "" : html`<div class="mt-3 flex flex-wrap items-center justify-center gap-2">${options.actions}</div>`}
  </div>`

/**
 * Previous/next pagination links.
 *
 * @param options - Current page, page count, target element, and a URL builder per page.
 * @returns The pagination fragment.
 */
export const Pagination = (options: {
  readonly page: number
  readonly pages: number
  readonly target?: string | undefined
  readonly href: (page: number) => string
}): RawHtml => {
  const target = options.target ?? "#main-content"

  return html`<div class="mt-3 flex items-center justify-between gap-2">
    <button
      class="btn btn-ghost btn-sm"
      ${options.page <= 1 ? raw("disabled") : ""}
      hx-get="${options.href(Math.max(options.page - 1, 1))}"
      hx-target="${target}"
      hx-swap="innerHTML"
    >
      ← Previous
    </button>
    <span class="text-sm opacity-70">Page ${options.page} of ${Math.max(options.pages, 1)}</span>
    <button
      class="btn btn-ghost btn-sm"
      ${options.page >= options.pages ? raw("disabled") : ""}
      hx-get="${options.href(options.page + 1)}"
      hx-target="${target}"
      hx-swap="innerHTML"
    >
      Next →
    </button>
  </div>`
}
