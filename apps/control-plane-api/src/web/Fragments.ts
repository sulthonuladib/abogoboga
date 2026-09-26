/**
 * Out-of-band fragments shared by every mutation response.
 *
 * @module
 */

import { html, type RawHtml } from "./Html.ts"

/**
 * Toast severity, mapped onto daisyUI alert classes.
 */
export type ToastKind = "success" | "error" | "info" | "warning"

const toastClass: Record<ToastKind, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
  warning: "alert-warning"
}

/**
 * Appends a toast to the shell's toast slot via an out-of-band swap.
 *
 * @param options - Toast kind and message.
 * @returns The out-of-band fragment.
 */
export const ToastOob = (options: { readonly kind: ToastKind; readonly message: string }): RawHtml =>
  html`<div id="toast-slot" hx-swap-oob="beforeend">
    <div class="alert ${toastClass[options.kind]} shadow-lg">
      <span class="text-sm">${options.message}</span>
    </div>
  </div>`

/**
 * Empties the modal slot via an out-of-band swap.
 *
 * @returns The out-of-band fragment.
 */
export const CloseModalOob = (): RawHtml => html`<div id="modal-slot" hx-swap-oob="true"></div>`

/**
 * Empties the drawer slot via an out-of-band swap.
 *
 * @returns The out-of-band fragment.
 */
export const CloseDrawerOob = (): RawHtml => html`<div id="drawer-slot" hx-swap-oob="true"></div>`

/**
 * Inline error alert.
 *
 * @param options - Operator-facing failure message.
 * @returns The alert fragment.
 */
export const ErrorFragment = (options: { readonly message: string }): RawHtml =>
  html`<div class="alert alert-error my-2" role="alert">
    <span class="text-sm">${options.message}</span>
  </div>`
