import { Html, type PropsWithChildren } from "@elysiajs/html";
import "@elysiajs/html/htmx";

const GLOBAL_BEHAVIOR_JS = `
(function () {
  var bar = function (on) {
    var el = document.getElementById('global-bar');
    if (el) el.classList.toggle('is-busy', on);
  };
  document.body.addEventListener('htmx:send', function () { bar(true); });
  document.body.addEventListener('htmx:afterOnLoad', function () { bar(false); });
  document.body.addEventListener('htmx:responseError', function () { bar(false); });
})();
`;

export function Layout({
  title,
  active,
  children,
}: PropsWithChildren<{ title: string; active?: string }>) {
  const nav = (href: string, label: string) => (
    <li>
      <a
        href={href}
        hx-get={href}
        hx-target="#main-content"
        hx-swap="innerHTML show:top"
        hx-push-url="true"
        hx-indicator="#global-bar"
        class={active === href ? "active" : ""}
      >
        {label}
      </a>
    </li>
  );
  const refreshTarget = active ?? "/dashboard";
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} · Lister</title>
        <link href="/static/app.css" rel="stylesheet" />
        <script src="/static/htmx.min.js" defer></script>
      </head>
      <body class="min-h-screen bg-base-200 antialiased">
        <div id="global-bar" aria-hidden="true"></div>
        <div class="drawer lg:drawer-open">
          <input id="app-nav-toggle" type="checkbox" class="drawer-toggle" />
          <div class="drawer-content flex min-h-screen flex-col">
            <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 shadow-sm backdrop-blur">
              <div class="navbar px-4">
                <div class="navbar-start gap-1">
                  <label
                    for="app-nav-toggle"
                    aria-label="Open navigation"
                    class="btn btn-ghost btn-sm lg:hidden"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="h-5 w-5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                      />
                    </svg>
                  </label>
                  <a
                    class="btn btn-ghost px-2 text-xl font-extrabold tracking-tight"
                    href="/dashboard"
                    hx-get="/dashboard"
                    hx-target="#main-content"
                    hx-swap="innerHTML show:top"
                    hx-push-url="true"
                  >
                    <span class="badge badge-primary badge-lg font-mono">L</span>
                    Lister
                  </a>
                </div>
                <div class="navbar-center hidden md:flex">
                  <div id="navbar-crumbs" class="breadcrumbs text-sm">
                    <ul>
                      <li>
                        <span class="opacity-70">{title}</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="navbar-end gap-1">
                  <button
                    class="btn btn-ghost btn-sm"
                    hx-get={refreshTarget}
                    hx-target="#main-content"
                    hx-swap="innerHTML show:top"
                    hx-push-url="true"
                    hx-indicator="#global-bar"
                  >
                    Refresh
                  </button>
                  <a
                    class="btn btn-ghost btn-sm"
                    href="/docs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    API
                  </a>
                </div>
              </div>
            </header>
            <main id="main-content" class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
              {children as unknown as "safe"}
            </main>
            <footer class="mx-auto w-full max-w-7xl px-4 pb-8 pt-2 sm:px-6">
              <div class="divider my-2"></div>
              <p class="text-xs opacity-50">
                Lister · crypto listing metadata · tables update in place via htmx
              </p>
            </footer>
          </div>
          <div class="drawer-side z-40">
            <label
              for="app-nav-toggle"
              aria-label="Close navigation"
              class="drawer-overlay"
            ></label>
            <aside class="flex min-h-full w-64 flex-col gap-2 bg-base-100 p-4 text-base-content">
              <a
                class="btn btn-ghost justify-start px-2 text-xl font-extrabold tracking-tight"
                href="/dashboard"
                hx-get="/dashboard"
                hx-target="#main-content"
                hx-swap="innerHTML show:top"
                hx-push-url="true"
              >
                <span class="badge badge-primary badge-lg font-mono">L</span>
                Lister
              </a>
              <ul class="menu w-full gap-1">
                {nav("/dashboard", "Dashboard") as unknown as "safe"}
                {nav("/coins", "Coins") as unknown as "safe"}
                {nav("/exchanges", "Exchanges") as unknown as "safe"}
                {nav("/chains", "Chains") as unknown as "safe"}
              </ul>
            </aside>
          </div>
        </div>
        <div id="drawer-slot"></div>
        <div id="modal-slot"></div>
        <div id="toasts" class="toast toast-end z-[100]"></div>
        <script>{GLOBAL_BEHAVIOR_JS as unknown as "safe"}</script>
      </body>
    </html>
  );
}

export function ErrorFragment({ message }: { message: string }) {
  return (
    <div class="alert alert-error my-2" role="alert">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="h-5 w-5 shrink-0"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
      <span class="text-sm">{message}</span>
    </div>
  );
}

/** Friendly not-found body used by GET /not-found (status 404).
 * Honors `from` (original path), `kind` + `id` (entity context).
 * Always rendered inside the shell; never redirects itself. */
export function NotFoundBody({
  from,
  kind,
  id,
}: {
  from?: string;
  kind?: string;
  id?: string;
}) {
  const kindLabel = kind ? kind : undefined;
  const what = kindLabel && id ? kindLabel + " " + id : kindLabel ? kindLabel : from ? from : "this page";
  const backHref = from && from.startsWith("/") ? from : undefined;
  return (
    <div class="mx-auto max-w-xl py-10 text-center">
      <p class="text-6xl font-black opacity-20">404</p>
      <h1 class="mt-2 text-2xl font-bold tracking-tight">Not found</h1>
      <p class="mt-2 text-sm opacity-70">
        {kind && id
          ? "We could not find " + what + "."
          : kind
            ? "We could not find that " + what + "."
            : from
              ? "We could not find " + what + "."
              : "We could not find what you were looking for."}
      </p>
      {from ? (
        <p class="mt-1 font-mono text-xs opacity-50">from {from}</p>
      ) : (
        ""
      )}
      <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <a
          class="btn btn-primary btn-sm"
          href="/dashboard"
          hx-get="/dashboard"
          hx-target="#main-content"
          hx-swap="innerHTML show:top"
          hx-push-url="true"
        >
          Dashboard
        </a>
        {backHref && backHref !== "/not-found" ? (
          <a
            class="btn btn-ghost btn-sm"
            href={backHref}
            hx-get={backHref}
            hx-target="#main-content"
            hx-swap="innerHTML show:top"
            hx-push-url="true"
          >
            ← Back
          </a>
        ) : (
          <a
            class="btn btn-ghost btn-sm"
            href="/coins"
            hx-get="/coins"
            hx-target="#main-content"
            hx-swap="innerHTML show:top"
            hx-push-url="true"
          >
            ← Back to Coins
          </a>
        )}
      </div>
    </div>
  );
}
