import { Html, type PropsWithChildren } from "@elysiajs/html";
import "@elysiajs/html/htmx";

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
        hx-swap="innerHTML"
        hx-push-url="true"
        class={active === href ? "active" : ""}
      >
        {label}
      </a>
    </li>
  );
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link href="/static/app.css" rel="stylesheet" />
        <script src="/static/htmx.min.js" defer></script>
      </head>
      <body class="min-h-screen bg-base-200">
        <header class="navbar bg-base-100 shadow-sm px-4">
          <div class="flex-1">
            <a
              class="btn btn-ghost text-xl"
              href="/dashboard"
              hx-get="/dashboard"
              hx-target="#main-content"
              hx-swap="innerHTML"
              hx-push-url="true"
            >
              Lister
            </a>
          </div>
          <nav class="flex-none">
            <ul class="menu menu-horizontal px-1">
              {nav("/dashboard", "Dashboard") as unknown as "safe"}
              {nav("/coins", "Coins") as unknown as "safe"}
              {nav("/exchanges", "Exchanges") as unknown as "safe"}
              {nav("/chains", "Chains") as unknown as "safe"}
            </ul>
          </nav>
        </header>
        <main id="main-content" class="mx-auto max-w-6xl p-4">
          {children as unknown as "safe"}
        </main>
        <div id="drawer-slot"></div>
        <div id="modal-slot"></div>
      </body>
    </html>
  );
}

export function ErrorFragment({ message }: { message: string }) {
  return (
    <div class="alert alert-error my-2" role="alert">
      <span>{message}</span>
    </div>
  );
}
