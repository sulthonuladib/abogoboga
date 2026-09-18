/**
 * Server-rendered control-plane routes on plain `HttpRouter`.
 *
 * Pages (`/dashboard`, `/coins`, `/exchanges`, `/chains`, detail pages,
 * `/coins/:id/routes`, `/not-found`) serve full documents or fragments
 * depending on `HX-Request`; mutations under `/partials/*` always serve
 * fragments with out-of-band toast and modal swaps. All reads and writes go
 * through the Phase-5 application services, never around them.
 *
 * The layer still requires the application services. Provide them with
 * `HttpRouter.provideRequest` at the composition root, or in tests, so the
 * route handlers receive a request-scoped context:
 *
 * ```ts
 * const App = WebRoutes.pipe(HttpRouter.provideRequest(ApplicationServices))
 * ```
 *
 * @module
 */

import { Layer } from "effect"
import { ChainsRoutes } from "./routes/Chains.ts"
import { CoinsRoutes } from "./routes/Coins.ts"
import { DashboardRoutes } from "./routes/Dashboard.ts"
import { DrawerRoutes } from "./routes/Drawer.ts"
import { ExchangesRoutes } from "./routes/Exchanges.ts"
import { MiscRoutes } from "./routes/Misc.ts"
import { RoutesMatrixRoutes } from "./routes/RoutesMatrix.ts"

/**
 * Every server-rendered control-plane route, unprovided.
 */
export const WebRoutes = Layer.mergeAll(
  DashboardRoutes,
  CoinsRoutes,
  ExchangesRoutes,
  ChainsRoutes,
  DrawerRoutes,
  RoutesMatrixRoutes,
  MiscRoutes
)
