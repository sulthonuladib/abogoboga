# Proposal

## Why

The control-plane UI is being rebuilt on Foldkit, a TypeScript framework built
on Effect and architected like Elm, because the current UI is a React
single-page application whose state, effects, and data access are spread across
component state, a cache, and hand-written mutations. A Foldkit app keeps the
Model as the single source of truth, confines side effects to Commands, and
server-renders, so a deep link arrives with its data already in the HTML.

The work has already started and is far enough along to plan: `apps/folding-plane`
holds a running shell, a typed client for the control-plane API, a production
host, and one complete page. What remains is a port of the other eight pages,
which is mechanical enough to specify before writing any of it.

The existing React control plane stays. It remains the default UI and the
subject of the `control-plane-web-app` capability. This change is additive, and
nothing about the JSON API changes.

## What Changes

- Keep the existing control plane. `apps/control-plane`, `packages/ui`, and the
  static routes the control-plane process serves are untouched, and the React
  application remains the default UI.
- Give the new application its own visual language rather than the React kit's.
  It is a redesign: its own palette, surfaces, radii, motion, and icon language,
  built on the component library the framework ships. It keeps the old
  application's routes, columns, and information, and none of its styling.
- Add a second browser UI in `apps/folding-plane`, a Foldkit app that
  server-renders its pages and hydrates them in place. It is a separate server
  on its own port and adds no endpoint to the control-plane process. Its server
  entry reads the control-plane API over HTTP to fill in the page it renders,
  and the browser reaches that API on the new app's own origin, which the new
  server forwards.
- Port all nine routes of the existing UI to that app: the dashboard, the coin
  listing and a coin's routes, the exchange listing and one exchange, the chain
  listing and one chain, the worker monitor, and the not-found page.
- Test the ported pages with the framework's update-level and view-level test
  tools, one story and one scene per page.
- Add a workspace catalog so every workspace resolves each shared dependency
  from one pinned version, replacing the range declarations that had drifted
  apart per package. This is already applied in the working tree.
- Wire the Foldkit devtools MCP server into the repository's OpenCode config,
  and refresh the app's `FOLDKIT.md` from the version-pinned upstream template.

An earlier pass in this change removed the React control plane, on the reading
that "rewrite the frontend" meant "replace it". That was wrong, and the files are
restored. Task group 1 exists to verify the restore, not to perform it.

No JSON API endpoint, request shape, or response shape changes.

## Capabilities

### New Capabilities

- `control-plane-folding-plane-web-app`: the server-rendered Foldkit control
  plane, served by its own server. Covers its routes, how that server reaches
  the control-plane API without adding an endpoint to it, its hydration
  contract, and its page-level behavior for coins, exchanges, chains, workers,
  and their listings.

### Modified Capabilities

None. `control-plane-web-app` continues to describe the React single-page
application, which this change keeps. `control-plane-query-api` describes
endpoints the new app reads but does not change.

## Impact

- **A separate server, and no new endpoints anywhere.** `apps/folding-plane` is
  its own process: the Vite dev server in development, its own `scripts/serve.ts`
  in production, on its own port. `apps/control-plane-api` is not extended,
  mounted into, or reconfigured to host it. It stays on its port, serving the
  JSON API and the React app exactly as it does today.
- **Shared data source.** Both UIs read the same `/api/*` endpoints over HTTP.
  The new app decodes responses with the schemas already declared in
  `packages/api`, so a response change breaks both frontends at once rather than
  silently.
- **Dependencies.** `foldkit`, `@foldkit/ui`, and their devtools enter the
  workspace through the catalog. The React dependencies already in the
  workspace are unaffected.
- **Repository configuration.** The root `package.json` gains the catalog, the
  root test and lint commands stop descending into the vendored reference
  checkout, and the root `tsconfig.json` and lint config exclude that checkout
  along with the React app's own project settings.
- **Nothing committed.** The change exists as uncommitted work in the working
  tree plus this change's artifacts.
