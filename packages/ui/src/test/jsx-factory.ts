// The repository root `tsconfig.json` configures JSX with the server-only
// classic factory `Html.createElement`. Bun resolves JSX configuration from the
// working directory, so `bun test packages/ui` run from the repository root
// compiles this package's `.tsx` files with that factory. Registering a
// React-backed global keeps those files rendering correctly. The package's own
// tsconfig uses the automatic runtime, so this global is inert when tests run
// from `packages/ui` itself.
import { Fragment, createElement } from "react";

declare global {
  /**
   * React-backed implementation of the classic JSX factory configured in the
   * repository root `tsconfig.json`.
   */
  var Html: {
    readonly createElement: typeof createElement;
    readonly Fragment: typeof Fragment;
  };
}

globalThis.Html = { createElement, Fragment };
