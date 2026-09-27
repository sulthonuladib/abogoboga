# Design

## Context

The control plane exposes one JSON API under `/api/*` with about twenty
endpoints, keyset and offset pagination, and a small set of tagged errors. Two
things read it today. The crawler reads it through the application services, and
the React control plane reads it over HTTP from a browser.

The new application is written against the same API, in a framework where the
Model is the single source of truth, Messages are facts, and every side effect
is a Command the runtime runs. Its conventions are fixed by the framework and
documented for agents in the app's own `FOLDKIT.md`.

Three constraints shape the approach.

- **The API is not to change.** The application reads it over HTTP, which means
  every response is validated against a schema that already exists in
  `packages/api`. A response that drifts breaks the application loudly.
- **The application is a separate server.** It adds no endpoint to the
  control-plane process, so its own server entry has to reach the API itself.
- **The existing control plane stays.** The new application is a second UI, not
  a migration of the first, and neither one may assume the other goes away.

A prototype already exists: a working shell, a typed client, a production host,
and one complete page at `/chains`. It renders with real data on a cold load.
Roughly a third of the port remains.

## Goals / Non-Goals

**Goals:**

- Cover all nine routes with behavior matching the capability spec, in one
  change, ordered so the shared parts are proven by the simplest page first.
- Keep the existing information architecture. The React pages decide what an
  operator sees, which columns, which dialogs, and which words. The new
  application keeps that and changes how it is built and how it looks.
- Prove the shared parts once: the rail, the table, the dialog, the form field,
  the search, the pager, and the server-rendered seed. Each page should be mostly
  its own columns and its own forms.
- One data path. A read is written once and runs in the browser and on the
  server.

**Non-Goals:**

- Changing any endpoint, request shape, or response shape.
- Re-thinking what the pages show. Where the interaction model itself is
  wrong, note it and leave it; changing it is a separate change.
- Sharing code with the React application. It keeps its own component kit in
  `packages/ui`, and the new application carries its own view helpers.
- Authentication. Neither application has it today.

## Decisions

### The application is its own server and reads the API as a client

The server entry resolves the page's data, renders it, and hands it to the
client so a cold load fetches nothing twice. That means the server needs the
same reads the browser needs, from the same code, against a configurable origin.

```
  browser                      folding-plane server            control-plane-api
  -------                      --------------------             ------------------
  GET /chains?q=eth
      |
      |  renderToString: init(Flags, url)
      |------------------------>  Flags = { theme, coverage, chains }
      |                             readChains(query)  --HTTP POST--> /api/chain/list
      |<------------------------  HTML with rows + Flags payload
      |
      |  hydrate: no read for what the server rendered
      |
  click a row
      |  Command: call(readChains(nextQuery))  --POST /api/chain/list-->  (same origin,
      |------------------------>  the server forwards ------------------------------+
```

**Alternative considered.** A separate API base URL for the browser, with CORS
enabled on the control plane. Rejected: it splits the origin story between
environments, and a browser-side cross-origin call is a preflight the folded
path does not need.

### Reads are exported unbound; each host provides its own origin

A page exports the read it performs, requiring the API services. A Command wraps
that read with the browser's layers, and the server entry wraps it with the
configured ones. One read, two hosts, no duplicated query.

```ts
// page/chains/update.ts
export const readChains = (query: ChainsQuery) =>
  Query.listChains({ ...query, limit: pageSize })   // requires ApiOrigin, HttpClient

const FetchChains = Command.define('FetchChains', {
  args: { query: ChainsQuery },
  messages: [Message.SettledFetchChains],
  execute: ({ query }) =>
    call(readChains(query)).pipe(                     // browser origin
      Effect.mapError((error) => error.detail),
      Effect.result,
      Effect.map((result) => Message.SettledFetchChains({ result })),
    ),
})
```

**Alternative considered.** Commands that provide their own layers entirely, so
nothing is threaded through the update signature. That is what the framework's
own examples do when a command needs a service, but it would make the server
entry's read a second implementation. Requirements are threaded instead, and
`call` closes them in one place.

### Flags carry the theme, the rail, and one page's seed

The server resolves three things before it renders: the theme from the request
cookie, the rail's figures, and a seed for the page it is about to render. A seed
is an `AsyncData` value, so a read that failed on the server still renders, with
the reason on the page and a retry beside it.

```ts
export const Flags = Schema.Struct({
  theme: Schema.Literals(['Light', 'Dark']),
  coverage: CoverageData.schema,
  chains: Schema.Option(Chains.Chains.schema),
})
```

A seed is absent when the server rendered a different route, and the page then
fetches its own data. A per-page optional field beats a union keyed by route: the
union's variants have to be kept in step with the route union by hand, and
nothing reads the difference.

**Alternative considered.** Rendering an empty shell and letting the client load
everything. Rejected: it throws away the reason to use a server-rendered
framework, and it makes the first paint of every page a spinner.

### The theme travels in a cookie

The server has to know the theme before it renders, and local storage is not
visible to it. A cookie is. The toggle writes it through a Command; the Model
carries the theme so the view can render it, and the view scopes the palette
with a data attribute rather than mutating the document.

**Alternative considered.** A blocking inline script in the document head that
reads local storage and sets a class before paint. Rejected: it is a second
source of truth for the same fact, and the view already has to know the theme.

### The URL owns the listing state

Search, sort, direction, and page are query parameters on the page's route. A
change to any of them is a navigation, and the page's route step re-reads. The
Model holds the same four values as plain data, derived from the route at init
and on every route change.

**Consequence worth stating.** A click that leaves the query unchanged, such as
re-clicking the current page number, must not fetch. The route step compares the
two queries first and returns the Model untouched.

**Alternative considered.** Keeping search and sort in the Model and only paging
in the URL. Rejected: a filtered, sorted listing would stop being shareable, and
two pages would resolve the same state by different rules.

### Search is a debounced, interruptible navigation

A keystroke updates the Model and starts a Command that waits for a pause in
typing before replacing the URL. The Command is interruptible by name, so the
next keystroke stops the pending wait instead of racing it. Only the last wait
reaches the URL, and the page that renders from that URL fetches once.

**Alternative considered.** Searching on every keystroke. Rejected: it turns a
six-letter coin symbol into seven requests, and the API is a database read per
request.

### Each page is a Submodel, and the root owns only routing, the rail, and the theme

The root Model holds one field per page plus the route, the theme, and the
coverage. Each page module owns its own Model, Message union, update, and view,
and reports back through a single OutMessage when a write changed the catalogue,
which the root turns into a rail re-read.

```
  root Model
    route  theme  coverage
    dashboard  coins  coinRoutes  exchanges
    exchangeDetail  chains  chainDetail  workers

  each page:  Model, Message, update, view
  root <- foldChild(page.update, read, write, toParentMessage, foldOutMessage)
  root <- ChangedUrl -> setRoute + the steps for the page that URL names
```

A page hears about a route only when the URL names it, so navigating away from a
listing does not refetch it. Each page holds one dialog Model per dialog it
shows, so two dialogs on one page cannot fight over whether they are open.

### Foldkit's own components wherever Foldkit ships one

`@foldkit/ui` is the application's component library. It has buttons, inputs,
selects, textareas, checkboxes, switches, radio groups, fieldsets, dialogs,
popovers, menus, listboxes, comboboxes, tabs, tooltips, navigation, disclosure,
sliders, calendars, drag and drop, file drop, virtualization, toasts, and
animation. The application's own view helpers exist only for the six things it
does not ship: a table, a badge, an alert, an empty state, a pager, and a field
shell. Every one of those lays out attributes that a Foldkit component produced.

Every component there is headless. It builds the attributes, including the ARIA
wiring, and hands them to the caller's `toView`, which owns the markup. The
behavior and the accessibility are therefore Foldkit's, and the presentation is
this application's by necessity rather than by preference.

Three things this application wrote by hand are replaced by what Foldkit ships:

- **The pager and the section navigation use `Nav`.** Both are URL-driven, and
  `Nav` marks the current destination from the URL. The pager becomes real links
  rather than buttons, so a page number can be opened in a new tab.
- **The theme toggle is a `Menu`** with Light and Dark items, so the control
  names its options instead of carrying their meaning in a label alone.
- **Static icon controls get a `Tooltip`.** Per-row icon buttons do not: a
  tooltip is a Submodel, so a table of twenty rows with two controls each would
  need a map of tooltip Models keyed by row. Those keep an accessible name and a
  native tooltip, which is the right weight for a control that only repeats its
  row's label.

`VirtualList` is not a way around the table. It forces `role="list"` on its
container and fills the space above and below the visible rows with spacer
elements, which is wrong for tabular data.

**Alternative considered.** Carrying the React kit's design language over so the
two applications look alike. Rejected: that kit is shadcn on React, set up for a
Vite and React build, and its tokens, its font, and its component set belong to
that application. Reusing its palette would make this one look like a port rather
than a redesign, and the two applications are meant to sit side by side, not to
be mistaken for one.

### The visual language is this application's own

`src/styles.css` defines this application's palette, type scale, radii, and dark
mode from scratch. Nothing is inherited from `packages/ui`, and no component from
that package is imported, directly or transitively. The two applications share
the JSON API, the routes, and the information on screen. They do not share a
look.

The reference for the treatment is the `better-ui` skill in the repository's
skills, and the rules below are its rules, applied rather than reinvented. The
skill's instruction to keep the project's tokens and density has nothing to keep
yet, which is the point: there is no project token set to defer to, and there is
a density worth keeping, because this is an operator tool and a table of twenty
rows should show twenty rows.

The prototype that exists today is a port and is treated as one. Its palette is
the React kit's, copied value for value, and its surfaces draw a border wherever
the old kit drew one. Four rules do the work of making it its own:

- **Surfaces, not outlines.** Depth comes from layered transparent shadows.
  Borders are kept where they carry meaning: a divider, the selected row, a
  focus ring. A card that has a border only to look raised does not get one.
- **One radius, applied concentrically.** A nested surface's radius is its
  parent's radius plus the padding between them. The inherited scale, which
  multiplied one base by fractions, cannot satisfy that and goes.
- **Motion with a purpose and a floor.** One curve for the application. A
  duration per class of interaction, with anything an operator triggers often
  answering within 150ms or not animating. A press scales slightly. A theme
  switch suppresses transitions for one frame, because otherwise a color change
  across every element at once reads as a smear.
- **Every state has a static cue.** Motion is never the only channel. A loading
  row still reads as loading with animation off, which is also what a reader with
  reduced motion gets.

Two rules are specific to this application rather than general:

- **Nothing animates in on a cold load.** The page arrives painted, so an
  entrance animation either does not run or flashes. A client-side navigation
  still transitions, because there the user asked for a change.
- **One icon set, one weight.** An icon beside text carries the text's optical
  weight, so the stroke is chosen per weight of text rather than per component.
  The rail marks its current section with a filled icon as well as a color, so
  the current location survives a monochrome display and a colorblind reader.

**Alternative considered.** Shipping the tokens with no reference treatment and
letting each page settle its own values. Rejected: nine pages drift into nine
looks within a week, which is the failure this decision exists to prevent.

### Lookups are Comboboxes, and one of them creates

Two places need a searchable picker over a remote collection: assigning a market
to an exchange, and linking a market to a chain. Both need a text query that
fetches as the operator types, so both use a Combobox submodel whose items come
from the page. The chain picker also offers to create the chain that was typed,
because the crawler discovers chains the catalogue does not have yet.

**Alternative considered.** A Listbox with a separate search field above it. It
is simpler, but the query and the results stop being one control, and the
framework's Listbox has no text entry of its own.

### The transfer matrix is derived, never stored

A route between two markets exists when the source can withdraw on a chain the
destination can deposit on. The page derives the whole matrix from the
metadata the API already returns, so there is no endpoint to add and nothing to
keep in sync. A pair is reported as full, one-way, or blocked, and the pair's
shared chains are named in a detail dialog.

### Writes report their outcome where they were made

The React application raised a toast for every write. The new one keeps the form
open on a refusal and shows the reason inside it, and a success closes the form
and re-reads. A toast that disappears takes the explanation with it, and a
dialog the operator is already looking at is where they look for the answer.

**Alternative considered.** Adding the framework's Toast submodel. It is a real
option and would restore parity. Deferred: the in-dialog notice satisfies the
spec, and Toast is a per-application binding that would be its own piece of
work. Recorded as a follow-up.

### One dependency version per package, from a catalog

Every workspace declares shared dependencies as `catalog:`, and the root
`package.json` holds one pinned version each, which is what lets the React
application, the crawler workers, and the Foldkit application resolve one copy
rather than one per range.

The pin is per package, and it is the version the suite has verified rather
than the newest published one. Two Effect platform packages are held back from
the newest release candidate because the newer one breaks their file reads under
this runtime: a read is rejected with an `AbortSignal` the runtime does not
recognize, and the failure shows up wherever a test exercises those reads.
Treating the catalog as "the latest of everything" reintroduces the drift it
was meant to remove.

## Risks / Trade-offs

- **The two UIs drift apart.** Two frontends over one API means a response change
  can land in one and not the other. Mitigation: the new application decodes with
  the schemas in `packages/api` rather than its own, so the compiler and the
  runtime both object when a response changes.
- **Five reads to paint the rail.** Every page render asks for five counts, and
  a cold load also asks for the page's rows. Mitigation: the counts are one-row
  queries, the rail reuses the last figures while a re-read is in flight, and a
  page that needs one of those numbers reuses it instead of asking again.
- **The coin routes page is the largest by a wide margin.** It carries the
  market list, the matrix, and a dialog with its own list of links and a picker.
  Mitigation: it is built after the three listings, so the shared pieces it uses
  are already proven, and it is the last page in the change rather than the
  first.
- **A search that fires on a stale origin.** A Command holds the origin it was
  created with, so a long-lived page behind a moved origin would read the old
  one. Mitigation: the origin is read from the layer at run time, and a
  development server restart is the only thing that changes it.
- **Deleting nothing leaves the repository carrying two frontends.** Mitigation:
  the new capability is a separate spec, so retiring the old one later is a
  change of its own with a decision attached, not an inference from this one.

## Migration Plan

There is no migration. Both applications are served at the same time and nothing
moves between them. A rollback is stopping the new server; the control-plane
process and the existing application are untouched by it.

The deployment order is one commit sequence ending with the new server's build
and host. Nothing has to be staged ahead of it, and nothing in the existing
control plane has to be coordinated with it.
