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
