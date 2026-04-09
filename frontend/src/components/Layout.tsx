import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/',                label: 'Dashboard'      },
  { to: '/order-flow',      label: 'Order Flow'     },
  { to: '/signals',         label: 'Signals'        },
  { to: '/market-levels',   label: 'Market Levels'  },
  { to: '/greeks',          label: 'Greeks'         },
  { to: '/analytics',       label: 'Analytics'      },
]

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 flex flex-col bg-surface-card border-r border-surface-border">
        <div className="px-5 py-5 border-b border-surface-border">
          <span className="text-brand-500 font-mono font-semibold text-sm tracking-wide">
            OPTIONS FLOW
          </span>
          <div className="text-[10px] text-surface-muted mt-0.5 font-mono">MBO Analytics Platform</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-surface'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-surface-border">
          <div className="text-[10px] text-surface-muted font-mono">v1.0.0</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 h-12 flex items-center justify-between px-6 border-b border-surface-border bg-surface-card">
          <span className="text-xs text-surface-muted font-mono">
            Powered by DuckDB + Polars
          </span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
