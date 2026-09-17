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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('modal-slot');
      if (modal) modal.innerHTML = '';
    }
  });
  document.body.addEventListener('htmx:afterSwap', function () {
    document.querySelectorAll('#toasts .alert:not([data-timed])').forEach(function (el) {
      el.setAttribute('data-timed', '1');
      setTimeout(function () {
        el.classList.add('toast-out');
        setTimeout(function () { el.remove(); }, 300);
      }, 4200);
    });
  });
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
        <header class="sticky top-0 z-40 border-b border-base-300 bg-base-100/90 shadow-sm backdrop-blur">
          <div class="navbar mx-auto max-w-7xl px-4">
            <div class="flex-1">
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
            <nav class="flex-none">
              <ul class="menu menu-horizontal hidden gap-1 px-1 sm:flex">
                {nav("/dashboard", "Dashboard") as unknown as "safe"}
                {nav("/coins", "Coins") as unknown as "safe"}
                {nav("/exchanges", "Exchanges") as unknown as "safe"}
                {nav("/chains", "Chains") as unknown as "safe"}
              </ul>
              <details class="dropdown dropdown-end sm:hidden">
                <summary class="btn btn-ghost btn-sm" aria-label="Open navigation">
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
                </summary>
                <ul class="menu dropdown-content z-50 w-52 rounded-box bg-base-100 p-2 shadow">
                  {nav("/dashboard", "Dashboard") as unknown as "safe"}
                  {nav("/coins", "Coins") as unknown as "safe"}
                  {nav("/exchanges", "Exchanges") as unknown as "safe"}
                  {nav("/chains", "Chains") as unknown as "safe"}
                </ul>
              </details>
              <a
                class="btn btn-ghost btn-sm ml-1 hidden sm:inline-flex"
                href="/docs"
                target="_blank"
                rel="noreferrer"
              >
                API
              </a>
            </nav>
          </div>
        </header>
        <main id="main-content" class="mx-auto max-w-7xl p-4 sm:p-6">
          {children as unknown as "safe"}
        </main>
        <footer class="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
          <div class="divider my-2"></div>
          <p class="text-xs opacity-50">
            Lister · crypto listing metadata · tables update in place via htmx
          </p>
        </footer>
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
