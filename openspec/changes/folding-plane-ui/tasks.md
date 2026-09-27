# Tasks

## 1. The existing control plane, kept unchanged

`apps/control-plane`, `packages/ui`, and the static routes the control-plane
process serves stay exactly as they are, and the React application remains the
default UI. This group checks that rather than doing it, because an earlier
pass in this change removed those files.

- [x] 1.1 Verify `apps/control-plane`, `packages/ui`, and
  `apps/control-plane-api/src/Spa.ts` match HEAD, and that the root
  `tsconfig.json` again excludes the React app's own project settings. Verify
  `git diff --stat HEAD -- apps/control-plane packages/ui
  apps/control-plane-api/src` reports nothing
- [x] 1.2 Verify the control-plane process still serves the React application at
  its root. Verify `bun run --cwd apps/control-plane build` succeeds and a
  request to the control-plane process's root returns the application shell

## 2. Repository configuration

- [x] 2.1 Confirm the workspace catalog is applied everywhere, and that each
  entry is a version the suite has verified rather than the newest published
  one. `@effect/sql-pg` and `@effect/platform-bun` are held at
  `4.0.0-rc.115` because `4.0.0-rc.117` breaks their file reads under this
  runtime. Verify no workspace `package.json` pins a version for a dependency the
  root catalog also pins, and that no test failure is attributable to a version
- [x] 2.2 Give each workspace's tests their own process, so one workspace's
  global setup cannot leak into another's. `packages/ui` registers a DOM
  implementation globally, which replaces the runtime's `AbortSignal` and
  breaks the file reads in `apps/cli` when both share a process. Verify
  `bun test ./packages/ui ./apps/cli` in one invocation passes
- [x] 2.3 Verify the Foldkit devtools MCP server is configured in the
  repository's OpenCode config and that a running dev server is reachable
  through it. Verify the tool reports the connected runtime
- [x] 2.4 Verify the app's `FOLDKIT.md` matches the version-pinned upstream
  template byte for byte, and that the app's `AGENTS.md` records the
  project-specific decisions
- [x] 2.5 Verify the root test and lint commands skip the vendored reference
  checkout. Verify `bun test ./packages ./apps` runs the workspace tests and
  none from `repos/`

## 3. Foundations of the new application

- [x] 3.1 Close the transport's failure channel so a body read that fails
  reports the same typed failure as everything else. Verify
  `bun run --cwd apps/folding-plane typecheck` is clean
- [x] 3.2 Write the first story test for the shared parts: a route change to a
  page with no seed fetches, and a route change that leaves the query unchanged
  fetches nothing. Verify it passes under
  `bun run --cwd apps/folding-plane test`
- [x] 3.3 Write the first scene test for the shell: the rail's labels are
  present, the current section is marked current, and a failed coverage read
  offers a retry. Verify it passes
- [x] 3.4 Fill the view-helper gaps the remaining pages need, once, in
  `src/ui/`: a filter select, a sortable header for a numeric column, and a
  section that pairs a heading with its note. Verify each has a scene test that
  exercises it through a rendered page
- [x] 3.5 Build the pager and the rail's section navigation on the component
  library's `Nav` rather than on hand-written anchors and buttons, so page
  numbers are links and the current destination is marked from the URL. Verify a
  page number carries an `href`, opens in a new tab, and that the current page
  and the current section are both marked current
- [x] 3.6 Build the theme toggle as the component library's `Menu` with Light and
  Dark items, and give the rail's static icon controls a `Tooltip`. Verify the
  toggle names its options in the rendered text, and that a tooltip appears for
  a static control while a per-row control keeps its accessible name without one

## 4. The visual foundation

The application is a redesign, not a port. The working tree starts from the React
kit's palette and its idioms, and this group replaces both. The reference is the
`better-ui` skill in the repository's skills, and the rules below are its rules,
not new ones. The token *names* stay stable through this group, so the pages
built after it resolve against finished values rather than placeholders.

- [x] 4.1 Replace the palette with values chosen for this application: one
  accent, one neutral temperature for text and surfaces, and one destructive
  tone. Nothing is carried over. Verify no custom property value in
  `src/styles.css` matches a value in `packages/ui`'s globals, by diffing the two
  files' declared values
- [x] 4.2 Reduce the color set to what the application actually raises: a page
  background, a card, a raised surface, a border, an accent, and a destructive
  tone, with dark mode as a second set of values for the same names. Verify
  every color used in `src/ui` and `src/view.ts` resolves to one of those names
  and that no component carries a theme check or a raw color
- [x] 4.3 Use shadows for depth and borders for structure. The nine current
  `border border-border` uses are depth, not structure. Verify each becomes a
  layered shadow, and that the borders that remain are dividers, the selected
  row, and focus
- [x] 4.4 Define one radius scale and apply the concentric rule, so a nested
  surface's radius is its parent's radius plus the padding between them. The
  inherited `radius * n` scale goes. Verify every nested pair in the rendered
  pages, such as a dialog panel inside its backdrop and a figure inside a rail
  cell, has the concentric relationship
- [x] 4.5 Define the motion language: one curve, a duration per interaction
  frequency, a scale on press, and transitions suppressed for one frame during a
  theme switch. Verify a theme switch snaps instead of smearing, that a press
  scales by the prescribed amount, and that no rule names every property
- [x] 4.6 Keep the first render still. A server-rendered page arrives painted, so
  nothing animates in on load. Verify a cold request shows no entrance
  animation while a client-side navigation still transitions
- [x] 4.7 Bring the icons to one set with one stroke weight, matched to the text
  beside them, drawn in the current color, with an outline default and a filled
  active state. The current weight was chosen by guess. Verify the rail marks
  its current section with fill as well as color, and that no icon carries a
  second weight
- [x] 4.8 Give every animated state a static cue as well, so a loading row still
  reads as loading with motion off. Verify the placeholder rows and the
  refetching state are legible with animation disabled
- [x] 4.9 Give coin and exchange logos a one-pixel outline at low opacity so they
  sit on either surface with the same depth. Verify a logo has a visible edge
  over the light surface and over the dark one

## 5. Chains page, the reference for the rest

- [x] 5.1 Hold `/chains` to the spec: sortable code, name, and creation time;
  search in the URL; paging; an editor that validates; a removal that states
  what it unlinks. Verify with a story test per transition and a scene test for
  the table, the empty state, the failure state, and both dialogs
- [x] 5.2 Verify the page end to end against a running control plane: a cold
  request to `/chains` renders rows, a reload on a filtered URL renders the same
  window, and adding a chain re-reads the rail

## 6. Dashboard

- [x] 6.1 Build the dashboard's two stat strips and its two shortlists, the
  blocked pairs and the thin coverage, from the counts and the two stats reads.
  Verify with a story test for each read settling and a scene test for both
  strips and both lists
- [x] 6.2 Verify the dashboard on a cold request renders figures rather than
  placeholders, and that a failed read shows the reason with a retry

## 7. Exchanges listing

- [ ] 7.1 Build the exchange listing: name, slug, base currency, CoinMarketCap
  registration, creation time, search, sorting, paging, and the editor and
  removal dialogs. Verify with a story test per transition and a scene test for
  the table, both empty states, and both dialogs
- [ ] 7.2 Verify the listing against a running control plane, including a
  search that matches on slug and a removal that re-reads the rail

## 8. Exchange detail

- [ ] 8.1 Build the exchange page: its own header, the three counts, and the
  table of its market assignments with the coin behind each. Verify with a
  scene test for the loaded, empty, and no-such-exchange states
- [ ] 8.2 Verify the page resolves coin names through the shared coin index
  rather than one request per row, and that a missing exchange reports itself
  instead of erroring

## 9. Coins listing

- [ ] 9.1 Build the coin listing: symbol, name, markets, chains, and blocked
  pairs, with the coverage filter, sorting on the counts, and paging. Verify
  with a story test per transition and a scene test for the table, the filtered
  and unfiltered empty states, and the editor
- [ ] 9.2 Build the coin form's validation and its refusal path: a duplicate
  slug or CoinMarketCap id keeps the form open with the reason. Verify with a
  story test driving the refusal and a scene test showing the reason
- [ ] 9.3 Verify the listing against a running control plane, including the
  blocked-routes and single-market filters

## 10. Chain detail

- [ ] 10.1 Build the chain page: its own header, the counts of distinct
  exchanges and coins, and the table of market links with the exchange chain code
  and the deposit and withdraw flags. Verify with a story test per read and a
  scene test for the loaded, empty, and no-such-chain states
- [ ] 10.2 Verify the page resolves each link's market and coin through the
  shared indexes, and that a link with an unresolvable market is skipped rather
  than shown blank

## 11. Workers

- [ ] 11.1 Build the worker monitor: one row per exchange with desired and
  actual state, shards with phase and restarts, and the eligible coin count.
  Verify with a scene test for the running, stopped, and reconnecting rows
- [ ] 11.2 Build start and stop, and the refusal path when the request is
  redundant. Verify with a story test for the success, the refusal, and the
  rail re-read, and a scene test for the refusal's message

## 12. A coin's routes

- [ ] 12.1 Build the market list with its exchange link, symbol, listed and
  trade-enabled flags, and chain badges. Verify with a scene test for the loaded
  and empty states
- [ ] 12.2 Derive the transfer matrix and build it, with the detail dialog
  naming the shared chains for a pair. Verify with a story test per pair status
  and a scene test for the matrix and the dialog
- [ ] 12.3 Build the assign, edit, and unassign dialogs and the exchange
  picker. Verify with a story test for each mutation settling and a scene test
  for the picker and the three dialogs
- [ ] 12.4 Build the chain-links dialog: the current links with their flags, the
  toggles, the unlink confirmation, and the chain picker that can create the
  chain that was typed. Verify with a story test for the toggle, the unlink, and
  the create, and a scene test for the dialog in each state
- [ ] 12.5 Verify the whole page against a running control plane, including that
  a flag toggle changes what the matrix reports and that a new link appears
  without a reload

## 13. Routes and states that span pages

- [ ] 13.1 Verify every route in the spec resolves: request each one on a cold
  load and confirm the matching page, then confirm an unknown path renders the
  not-found page. Verify with a scene test per route and a request per route
- [ ] 13.2 Verify the not-found page offers a way back and carries the path that
  was requested. Verify with a scene test
- [ ] 13.3 Verify the theme: switching it survives a reload with no flash of the
  other theme, and a browser with no recorded theme gets the light one. Verify
  with a story test for the toggle and a request carrying the cookie

## 14. Serving the built application

- [ ] 14.1 Verify the production build emits a client bundle and a server bundle
  from one build id. Verify `bun run --cwd apps/folding-plane build` succeeds
  and both files carry the same id
- [ ] 14.2 Verify the production host serves assets, forwards `/api` to the
  control plane, and renders pages for everything else, including a deep link
  and an off-origin request. Verify each with a request against the running host
- [ ] 14.3 Verify hydration refuses when a page and a client come from different
  builds rather than adopting mismatched markup. Verify by serving a page from
  one build and a client from another and confirming the refusal

## 15. Integration

- [ ] 15.1 Verify the whole workspace: `bun test ./packages ./apps` passes and
  `bun run --cwd apps/folding-plane typecheck` and its lint are clean
- [ ] 15.2 Review the new application against the app's own conventions and the
  framework's, and record every deviation with its reason. Verify the review
  covers every page module, the shared view helpers, and both entries
- [ ] 15.3 Verify the capability spec still describes what the application does,
  and record any requirement the port could not meet rather than leaving it
  silently unmet
