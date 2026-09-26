/**
 * Full-document shell for server-rendered pages.
 *
 * @module
 */

import { html, join, type RawHtml } from "./Html.ts"

const navItem = (options: { readonly href: string; readonly label: string; readonly active: string }): RawHtml =>
  html`<li>
    <a
      href="${options.href}"
      hx-get="${options.href}"
      hx-target="#main-content"
      hx-swap="innerHTML show:top"
      hx-push-url="true"
      class="${options.active === options.href ? "active" : ""}"
      >${options.label}</a
    >
  </li>`

/**
 * Wraps page content in the application shell.
 *
 * The shell owns the HTMX swap targets every partial relies on: `#main-content`
 * for navigation, `#modal-slot`, `#drawer-slot`, and `#toast-slot`.
 *
 * @param options - Page title, active nav path, and body markup.
 * @returns The complete document.
 */
export const Layout = (options: {
  readonly title: string
  readonly active: string
  readonly children: RawHtml
}): RawHtml => {
  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/coins", label: "Coins" },
    { href: "/exchanges", label: "Exchanges" },
    { href: "/chains", label: "Chains" },
    { href: "/workers", label: "Workers" }
  ].map((item) => navItem({ href: item.href, label: item.label, active: options.active }))

  return html`<!doctype html>
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${options.title} · Lister</title>
        <link href="/static/app.css" rel="stylesheet" />
        <script src="/static/htmx.min.js" defer></script>
      </head>
      <body class="min-h-screen bg-base-200 antialiased">
        <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 shadow-sm backdrop-blur">
          <div class="navbar mx-auto w-full max-w-7xl gap-2 px-4">
            <div class="navbar-start gap-2">
              <a
                class="btn btn-ghost px-2 text-xl font-extrabold tracking-tight"
                href="/dashboard"
                hx-get="/dashboard"
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
                ><span class="badge badge-primary badge-lg font-mono">L</span> Lister</a
              >
            </div>
            <div class="navbar-center hidden md:flex">
              <ul class="menu menu-horizontal gap-1">
                ${join(nav)}
              </ul>
            </div>
            <div class="navbar-end gap-1">
              <button
                class="btn btn-ghost btn-sm"
                hx-get="${options.active === "" ? "/dashboard" : options.active}"
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
              >
                Refresh
              </button>
              <a class="btn btn-ghost btn-sm" href="/docs" target="_blank" rel="noreferrer">API</a>
            </div>
          </div>
        </header>
        <main id="main-content" class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">${options.children}</main>
        <div id="drawer-slot"></div>
        <div id="modal-slot"></div>
        <div id="toast-slot" class="toast toast-end z-[100]"></div>
      </body>
    </html>`
}
