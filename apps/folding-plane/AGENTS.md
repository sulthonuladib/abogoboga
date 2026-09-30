# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: true

## Project Notes
### Where things live

- `src/route.ts`: every route, its URL, and the `AppRoute` union. The URL is the source
  of truth for search, sort, and page, which is why those are route parameters.
- `src/api.ts`: the only module that talks to the control-plane API. Every page reaches
  the server through it.
- `src/realtime.ts`: the app-wide event socket. One ManagedResource opens the WebSocket at
  boot and keeps it across navigation; Subscriptions read its frames and gate the `signal`
  topic on the Signals route. The server projector runs only while that topic has a
  subscriber.
- `src/ui/`: the shared view helpers. There is no table, badge, alert, or empty-state
  component in `@foldkit/ui`, so they are written here as plain functions over `h`.
- `src/page/`: one directory per page, each a Submodel with `model.ts`, `message.ts`,
  `update.ts`, and `view.ts`.
- `src/flags.ts`: the union of per-route payloads the server entry resolves before
  rendering. This is how a page arrives with its data in the HTML.

### Conventions that differ from the Foldkit defaults

- Each page owns a `Dialog.Model` per dialog it shows rather than a single shared
  dialog, so two dialogs on one page cannot fight over `isOpen`.
- The API returns pages as offset windows. Pass `page` explicitly. A request that
  passes neither `page` nor `cursor` takes the keyset path, where `meta.items` counts
  the rows on screen instead of the total, and the rail's coverage counters would read
  wrong.
- `limit: -1` means every row on one page. Detail pages use it for the indexes they
  resolve names from.
- Icons are inline SVG built in `src/ui/icon.ts`. The old app used Phosphor; this app
  carries no icon package.

### Local tracing

The browser exports spans under the service name `folding-plane`, and the server
under `folding-plane-host`. Both export nothing unless a collector is
configured, so a checkout without one behaves as it did before.

From the repo root, start the collector the repo ships, then open
`http://localhost:16686`:

```sh
docker compose up -d jaeger
```

Point the dev server at it. This needs three variables: the browser reads the
`VITE_` one, and the render the server runs in the same process reads the
`OTEL_` pair.

```sh
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_TRACES_EXPORTER=otlp \
bun run dev:web
```

For the production host, set the `VITE_` variable when building so it is
compiled into the browser bundle, then start the host with the `OTEL_` pair:

```sh
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 bun run build:web

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_TRACES_EXPORTER=otlp \
bun run --cwd apps/folding-plane start
```

The collector accepts browser exports from `http://localhost:3000`,
`http://localhost:4173`, and `http://localhost:5173`; see `jaeger/config.yaml`.
Serve the app from one of those origins, which is where `vite` and
`scripts/serve.ts` already put it. Traces only: log and metric export stay off,
and unsetting the variables turns every process back into the one with no
collector.
