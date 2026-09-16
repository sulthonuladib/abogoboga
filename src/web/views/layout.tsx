import { Html, type PropsWithChildren } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export function Layout({
  title,
  active,
  children,
}: PropsWithChildren<{ title: string; active?: string }>) {
  const nav = (href: string, label: string) => (
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
  );
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <script src="/static/htmx.min.js" defer></script>
        <style>{"body{font-family:system-ui,sans-serif;margin:0}header{border-bottom:1px solid #ddd;padding:12px 16px}nav{display:flex;gap:12px}nav a.active{font-weight:700}#main-content{padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}.error{color:#a00;border:1px solid #a00;padding:8px;margin:8px 0}.htmx-indicator{display:none}.htmx-request .htmx-indicator{display:inline}"}</style>
      </head>
      <body>
        <header>
          <nav>
            {nav("/dashboard", "Dashboard") as unknown as "safe"}
            {nav("/coins", "Coins") as unknown as "safe"}
            {nav("/exchanges", "Exchanges") as unknown as "safe"}
            {nav("/chains", "Chains") as unknown as "safe"}
          </nav>
        </header>
        <main id="main-content">{children as unknown as "safe"}</main>
        <div id="drawer-slot"></div>
        <div id="modal-slot"></div>
      </body>
    </html>
  );
}

export function ErrorFragment({ message }: { message: string }) {
  return (
    <div class="error" role="alert">
      {message}
    </div>
  );
}
