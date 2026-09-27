import { useAtomValue } from "@effect/atom-react"
import { cn } from "@lister/ui"
import { Link, NavLink, Outlet } from "react-router"
import { AsyncResult } from "effect/unstable/reactivity"
import {
  ArrowsLeftRightIcon,
  ChartLineUpIcon,
  CoinsIcon,
  GaugeIcon,
  LinkSimpleIcon,
  PulseIcon,
  type Icon
} from "@phosphor-icons/react"
import { chainListAtom, coinStatsAtom, exchangeListAtom, workersAtom } from "../api/atoms.ts"
import { formatCount } from "../lib/format.ts"
import { ThemeToggle } from "./ThemeToggle.tsx"

type NavItem = {
  readonly to: string
  readonly label: string
  readonly icon: Icon
}

const navItems: ReadonlyArray<NavItem> = [
  { to: "/dashboard", label: "Dashboard", icon: GaugeIcon },
  { to: "/coins", label: "Coins", icon: CoinsIcon },
  { to: "/exchanges", label: "Exchanges", icon: ArrowsLeftRightIcon },
  { to: "/chains", label: "Chains", icon: LinkSimpleIcon },
  { to: "/workers", label: "Workers", icon: PulseIcon }
]

const NavItems = (props: { readonly compact?: boolean | undefined }) => (
  <>
    {navItems.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2.5 rounded-3xl text-sm whitespace-nowrap transition-colors",
            props.compact === true ? "px-3 py-1.5" : "px-3 py-2",
            isActive
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon className="size-4" weight={isActive ? "fill" : "regular"} />
            {item.label}
          </>
        )}
      </NavLink>
    ))}
  </>
)

/**
 * Live coverage counters shown at the foot of the rail.
 *
 * Each figure is the total reported by a one-row page query, so the rail never
 * needs a dedicated counting endpoint.
 */
const CoverageSummary = () => {
  const coins = useAtomValue(coinStatsAtom({ limit: 1, page: 1 }))
  const exchanges = useAtomValue(exchangeListAtom({ limit: 1, page: 1 }))
  const chains = useAtomValue(chainListAtom({ limit: 1, page: 1 }))
  const workers = useAtomValue(workersAtom())

  const total = (result: AsyncResult.AsyncResult<{ readonly meta: { readonly items: number } }, unknown>) =>
    AsyncResult.isSuccess(result) ? formatCount(result.value.meta.items) : "…"

  const workerSummary = AsyncResult.isSuccess(workers)
    ? `${formatCount(workers.value.filter((worker) => worker.running).length)}/${formatCount(workers.value.length)}`
    : "…"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-sidebar-foreground">Coverage</p>
        <ThemeToggle />
      </div>
      <dl className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Coins</dt>
          <dd className="tabular-nums">{total(coins)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Exchanges</dt>
          <dd className="tabular-nums">{total(exchanges)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Chains</dt>
          <dd className="tabular-nums">{total(chains)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Workers running</dt>
          <dd className="tabular-nums">{workerSummary}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Application shell: fixed rail on desktop, horizontal nav on small screens,
 * and the routed page in the remaining space.
 */
export const Shell = () => (
  <div className="flex min-h-dvh flex-col bg-background md:flex-row">
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <ChartLineUpIcon className="size-5 text-primary" weight="fill" />
        <Link to="/dashboard" className="text-base font-semibold tracking-tight">
          Lister
        </Link>
        <span className="text-xs text-muted-foreground">control plane</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        <NavItems />
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3">
        <CoverageSummary />
      </div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-sidebar-border bg-sidebar px-2 py-1.5 md:hidden">
        <NavItems compact />
      </div>
      <main className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-6 px-4 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  </div>
)
