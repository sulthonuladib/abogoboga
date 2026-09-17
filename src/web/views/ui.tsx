import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type ToastKind = "success" | "error" | "info" | "warning";

const toastClass: Record<ToastKind, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
  warning: "alert-warning",
};

const toastIcon: Record<ToastKind, string> = {
  success:
    "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  error:
    "M9.143 17.082a24.848 24.848 0 0 0 5.454 0M9.143 12.918a24.848 24.848 0 0 0 5.454 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  info: "M12 16.5V12m0-3.75v.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  warning:
    "M12 9v3.75m0 3.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

/** Inline toast appended to #toasts via out-of-band swap. */
export function ToastOob({
  kind,
  message,
}: {
  kind: ToastKind;
  message: string;
}) {
  return (
    <div id="toasts" hx-swap-oob="beforeend">
      <div class={"alert " + toastClass[kind] + " shadow-lg"}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="h-5 w-5 shrink-0"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d={toastIcon[kind]} />
        </svg>
        <span class="text-sm">{message}</span>
      </div>
    </div>
  );
}

/** Out-of-band fragment that closes the modal. */
export function CloseModalOob() {
  return <div id="modal-slot" hx-swap-oob="true"></div>;
}

/** Out-of-band fragment that closes the drawer. */
export function CloseDrawerOob() {
  return <div id="drawer-slot" hx-swap-oob="true"></div>;
}

/**
 * Native dialog modal shell.
 * Dismissal is native: close button (form method=dialog), backdrop
 * (form method=dialog), Cancel inside the inner form via
 * formmethod=dialog, and Escape via the dialog element itself.
 */
export function ModalShell({
  title,
  subtitle,
  error,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  children: unknown;
  wide?: boolean;
}) {
  return (
    <div id="modal-slot">
      <dialog open id="app-modal" class="modal modal-bottom sm:modal-middle">
        <div class={"modal-box " + (wide ? "max-w-2xl" : "")}>
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold">{title}</h3>
              {subtitle ? (
                <p class="mt-1 text-sm opacity-70">{subtitle}</p>
              ) : (
                ""
              )}
            </div>
            <form method="dialog">
              <button
                type="submit"
                class="btn btn-circle btn-ghost btn-sm"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </form>
          </div>
          {error ? (
            <div class="alert alert-error mb-3" role="alert">
              <span class="text-sm">{error}</span>
            </div>
          ) : (
            ""
          )}
          {children as unknown as "safe"}
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label="Close dialog">close</button>
        </form>
      </dialog>
    </div>
  );
}

/** Standard page header with breadcrumbs, count and action buttons.
 * When a count is shown it MUST reuse the listing's single badge id
 * (e.g. #coins-count) via countId instead of a second #page-count. */
export function PageHeader({
  title,
  subtitle,
  count,
  countId,
  actions,
  crumbs,
}: {
  title: string;
  subtitle?: string;
  count?: string;
  countId?: string;
  actions?: unknown;
  crumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div class="mb-5">
      {crumbs && crumbs.length > 0 ? (
        <div class="breadcrumbs pb-1 text-sm">
          <ul>
            {crumbs.map((crumb) =>
              crumb.href ? (
                <li>
                  <a
                    href={crumb.href}
                    hx-get={crumb.href}
                    hx-target="#main-content"
                    hx-swap="innerHTML"
                    hx-push-url="true"
                  >
                    {crumb.label}
                  </a>
                </li>
              ) : (
                <li>{crumb.label}</li>
              ),
            ) as unknown as "safe"}
          </ul>
        </div>
      ) : (
        ""
      )}
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {title}
            {count ? (
              countId ? (
                <span id={countId} class="badge badge-neutral">
                  {count}
                </span>
              ) : (
                <span class="badge badge-neutral">{count}</span>
              )
            ) : (
              ""
            )}
          </h1>
          {subtitle ? (
            <p class="mt-1 max-w-2xl text-sm opacity-70">{subtitle}</p>
          ) : (
            ""
          )}
        </div>
        {actions ? (
          <div class="flex flex-wrap items-center gap-2">
            {actions as unknown as "safe"}
          </div>
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

/** Labeled form field with optional hint. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: unknown;
}) {
  return (
    <label class="form-control w-full">
      <div class="label py-1">
        <span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">
          {label}
        </span>
      </div>
      {children as unknown as "safe"}
      {hint ? (
        <div class="label py-1">
          <span class="label-text-alt opacity-60">{hint}</span>
        </div>
      ) : (
        ""
      )}
    </label>
  );
}

/** Friendly empty state for tables and lists with optional actions. */
export function EmptyState({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: unknown;
}) {
  return (
    <div class="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="h-8 w-8 opacity-30"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
      <p class="font-semibold">{title}</p>
      {hint ? <p class="text-sm opacity-60">{hint}</p> : ""}
      {actions ? (
        <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
          {actions as unknown as "safe"}
        </div>
      ) : (
        ""
      )}
    </div>
  );
}

/** Small inline loading indicator wired to htmx. */
export function InlineLoading({ id }: { id: string }) {
  return (
    <span
      id={id}
      class="htmx-indicator items-center gap-2 text-sm opacity-70"
    >
      <span class="loading loading-spinner loading-sm"></span>
      Loading…
    </span>
  );
}

/** Submit button with built-in htmx spinner. Pair with
 * hx-disabled-elt="find button[type=submit]" + hx-indicator on the form. */
export function SubmitButton({
  label,
  indicatorId,
  kind,
}: {
  label: string;
  indicatorId: string;
  kind?: string;
}) {
  return (
    <button type="submit" class={"btn btn-sm " + (kind ?? "btn-primary")}>
      <span id={indicatorId} class="htmx-indicator">
        <span class="loading loading-spinner loading-xs"></span>
      </span>
      {label}
    </button>
  );
}

/** Cancel button that dismisses the native dialog without submitting.
 * Must live inside the hx-post form; formmethod=dialog closes the dialog
 * instead of issuing a request. */
export function CancelButton({ label }: { label?: string }) {
  return (
    <button
      type="submit"
      formmethod="dialog"
      formnovalidate
      class="btn btn-ghost btn-sm"
    >
      {label ?? "Cancel"}
    </button>
  );
}
