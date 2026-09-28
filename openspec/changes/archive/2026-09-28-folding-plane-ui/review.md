# Implementation review (task 15.2)

Reviewed every page module (`src/page/*/model.ts`, `message.ts`, `update.ts`,
`view.ts`), the shared helpers (`src/ui/*`, `src/api/*`, `src/route.ts`,
`src/coverage.ts`, `src/theme.ts`, `src/themeMenu.ts`), and both entries
(`src/entry.ts`, `src/entry.server.ts`) against the app's own conventions
(`apps/folding-plane/AGENTS.md`, `FOLDKIT.md`) and the framework's lint rules.
`bun run --cwd apps/folding-plane typecheck`, `test` (208 tests), and `lint`
are clean.

## Conformance

- Each page is a Submodel with `model.ts`, `message.ts`, `update.ts`,
  `view.ts`; the root owns routing, the rail, and the theme. Each listing page
  owns one `Dialog.Model` per dialog. Reads are exported unbound
  (`readCoins`, `readChains`, `readMetadata`, …) and run on both hosts.
- Listing state (search, sort, direction, page, plus the coin coverage flag)
  lives in the URL; a query-identical route change fetches nothing.
- Search is debounced and interruptible by name. Sort and filter changes are
  navigations. Flags carry theme, rail coverage, and one page seed.
- Views use `@foldkit/ui` components wherever one exists (`Dialog`, `Menu`,
  `Tooltip`, `Nav`, `Input`, `Select`, `Checkbox`, `Button`); the six
  hand-written helpers (table, badge, alert, empty state, pager, field shell)
  lay out Foldkit-produced attributes.
- Motion, radius, shadow, icon, and static-cue rules follow the `better-ui`
  treatment already proven by the earlier pages. No `transition: all`, no
  entrance on cold load (`page-enter` only after navigation), theme switch
  suppresses transitions for one frame, one 1.5px icon set in `currentColor`.
- No imports from `repos/` or from `packages/ui`; data is decoded with the
  schemas in `packages/api`. No page adds an endpoint to the control plane.

## Deviations, with reasons

1. **Pickers are labelled searches with option buttons, not `Combobox`
   submodels.** The design names `Combobox` for the exchange and chain
   lookups. The coin-routes page instead renders a named search box
   (`Search exchanges`, `Search chains`) with a `listbox` of option buttons,
   driven by the page's own `FetchAssignExchanges` / `FetchLinkChains`
   commands. The chain picker still creates the typed chain through
   `find-or-create` (`Add chain "…"`) when nothing matches. Reason: two fewer
   Submodel wirings, every state is scene-testable, behavior is preserved.
2. **No worker polling.** The React page refreshes status every five seconds;
   this page loads on entry, re-reads after each mutation, and offers a retry.
   The capability spec does not require polling. Reason: fewer timers and
   commands; freshness is covered where it matters.
3. **Worker shards render inline, not as expandable rows.** Phase and restart
   counts are visible without interaction. Reason: simpler Model, all
   information on screen.
4. **Assign dialog confirms with `Confirm assign`.** The React UI reuses
   `Assign market` for the header action and the dialog submit; here the two
   share the title `Assign market` but the submit reads `Confirm assign`.
   Reason: the shared label made the two buttons indistinguishable to the
   scene tests; behavior is unchanged.
5. **Theme default is Light.** `themeFromCookieHeader` fell back to Dark; the
   spec requires Light for browsers with no recorded theme. Fixed, with a
   story test pinning the default and the cookie override.
6. **Coin edit carries no logo field.** Matches the API update surface (which
   omits `logo`) and the React form (logo on create only).
7. **No toasts.** Deferred in the design; successes close the form and
   re-read, refusals stay open with the reason in the dialog.

## Capability coverage (task 15.3)

Walked every requirement in
`specs/control-plane-folding-plane-web-app/spec.md` against the implementation
and the live servers. All scenarios hold: own server with no new control-plane
endpoints, server-rendered pages that hydrate without re-reading the seed,
unshadowed `/api` forwarding, URL-owned listing state, rail coverage with
refresh-after-write and stale-plus-retry, the coin/exchange/chain listings with
their filters/dialogs/refusals, the exchange and chain detail pages resolving
names through the shared indexes (unresolvable chain-link markets skipped),
the worker monitor with start/stop and redundant-request refusals, forms that
block incomplete writes and keep refused writes open with the reason, the
cookie-carried Light-default theme with no flash, and named/announced
controls with `role="alert"` failures. No requirement is silently unmet.
