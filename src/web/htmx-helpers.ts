import type { HtmxContext } from "elysia-htmx";

export function wantsFragment(hx: HtmxContext["hx"]): boolean {
  return hx.request && !hx.historyRestoreRequest;
}

export function setFragmentHeaders(set: { headers: Record<string, unknown> }): void {
  set.headers["Vary"] = "HX-Request";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
