import { RegistryProvider } from "@effect/atom-react"
import { Toaster } from "@lister/ui/components/toast"
import { TooltipProvider } from "@lister/ui/components/tooltip"
import { Navigate, Route, Routes } from "react-router"
import { ChainDetailPage } from "./pages/ChainDetail.tsx"
import { ChainsPage } from "./pages/Chains.tsx"
import { CoinRoutesPage } from "./pages/CoinRoutes.tsx"
import { CoinsPage } from "./pages/Coins.tsx"
import { DashboardPage } from "./pages/Dashboard.tsx"
import { ExchangeDetailPage } from "./pages/ExchangeDetail.tsx"
import { ExchangesPage } from "./pages/Exchanges.tsx"
import { NotFoundPage } from "./pages/NotFound.tsx"
import { WorkersPage } from "./pages/Workers.tsx"
import { Shell } from "./ui/Shell.tsx"

/**
 * Application root: atom registry, toaster, and the client routes.
 *
 * Deep links resolve through the production catch-all and the Vite dev server
 * alike; unknown client routes render the not-found view.
 *
 * @module
 */
export const App = () => (
  <RegistryProvider>
    <TooltipProvider>
      <Toaster>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/coins" element={<CoinsPage />} />
            <Route path="/coins/:id/routes" element={<CoinRoutesPage />} />
            <Route path="/exchanges" element={<ExchangesPage />} />
            <Route path="/exchanges/:id" element={<ExchangeDetailPage />} />
            <Route path="/chains" element={<ChainsPage />} />
            <Route path="/chains/:id" element={<ChainDetailPage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Toaster>
    </TooltipProvider>
  </RegistryProvider>
)
