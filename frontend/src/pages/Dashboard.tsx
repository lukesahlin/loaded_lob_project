import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { KPICard } from '../components/KPICard'
import { ChartCard } from '../components/ChartCard'
import { LoadingSpinner, ErrorMsg } from '../components/LoadingSpinner'
import { useKpi, useBasis, usePullingStacking } from '../hooks/useChartData'

function fmt(n: number | null | undefined, decimals = 0) {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export function Dashboard() {
  const empty = {}
  const { data: kpi, isLoading: kpiLoading, error: kpiError } = useKpi(empty)
  const { data: basis, isLoading: basisLoading } = useBasis(empty)
  const { data: ps, isLoading: psLoading } = usePullingStacking(empty)

  const recentPs = useMemo(() => {
    if (!ps) return []
    return ps.slice(-500)
  }, [ps])

  const basisSample = useMemo(() => {
    if (!basis) return []
    return basis.slice(-120)
  }, [basis])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-surface-muted mt-1">
          Options Flow Analytics — MBO Market Microstructure
        </p>
      </div>

      {/* KPI Row */}
      {kpiLoading ? (
        <LoadingSpinner height="h-20" />
      ) : kpiError ? (
        <ErrorMsg message="Failed to load KPIs" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="Total Events"    value={fmt(kpi?.total_events as number)}         accent="blue" />
          <KPICard label="Unique Strikes"  value={fmt(kpi?.unique_strikes as number)}        />
          <KPICard label="ES Strikes"      value={fmt(kpi?.unique_es_strikes as number)}     />
          <KPICard label="Avg SPX Price"   value={fmt(kpi?.avg_spx_price as number, 2)}      accent="green" />
          <KPICard label="P/S Events"      value={fmt(kpi?.total_ps_events as number)}       accent="red" />
          <KPICard
            label="Date Range"
            value={kpi?.start_date ? format(new Date(kpi.start_date as string), 'MM/dd HH:mm') : '—'}
            sub={kpi?.end_date ? `→ ${format(new Date(kpi.end_date as string), 'HH:mm')}` : undefined}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ES vs SPX Basis */}
        <ChartCard
          title="ES vs SPX Basis"
          subtitle="Basis (left) vs ES &amp; SPX price (right) — divergence signals imminent move"
        >
          {basisLoading ? (
            <LoadingSpinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={basisSample}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="time_bucket"
                  tickFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm')}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} label={{ value: 'Basis', angle: -90, position: 'insideLeft', fill: '#6366f1', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} label={{ value: 'Price', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm:ss')}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left"  dataKey="basis"     name="Basis" stroke="#6366f1" dot={false} strokeWidth={2} />
                <Line yAxisId="right" dataKey="es_price"  name="ES"    stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                <Line yAxisId="right" dataKey="spx_price" name="SPX"   stroke="#34d399" dot={false} strokeWidth={1} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Pulling/Stacking Ticker */}
        <ChartCard
          title="Recent P/S Events"
          subtitle="SPX price with pulling (red) and stacking (green) markers"
        >
          {psLoading ? (
            <LoadingSpinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={recentPs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm')}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm:ss')}
                />
                <Line dataKey="spx_price" name="SPX" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
                <Line
                  dataKey="spx_price"
                  name="P/S Events"
                  stroke="none"
                  legendType="none"
                  isAnimationActive={false}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props
                    if (payload.MBO_pulling_stacking < 0)
                      return <circle key={`p${cx}`} cx={cx} cy={cy} r={4} fill="#f87171" stroke="#1e293b" strokeWidth={1} />
                    if (payload.MBO_pulling_stacking > 0)
                      return <circle key={`s${cx}`} cx={cx} cy={cy} r={4} fill="#34d399" stroke="#1e293b" strokeWidth={1} />
                    return <g key={`n${cx}`} />
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Domain glossary */}
      <div className="card grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs">
        <div>
          <span className="text-brand-500 font-mono font-semibold">MBO</span>
          <span className="text-surface-muted ml-2">Market-By-Order: individual order sizes at each price level</span>
        </div>
        <div>
          <span className="text-red-400 font-mono font-semibold">Pulling</span>
          <span className="text-surface-muted ml-2">Rapid order cancellation — often precedes a price drop</span>
        </div>
        <div>
          <span className="text-emerald-400 font-mono font-semibold">Stacking</span>
          <span className="text-surface-muted ml-2">Rapid order addition — often precedes a rally</span>
        </div>
        <div>
          <span className="text-yellow-400 font-mono font-semibold">Vanna</span>
          <span className="text-surface-muted ml-2">dDelta/dVol — IV moves cause automatic delta hedging flows</span>
        </div>
        <div>
          <span className="text-purple-400 font-mono font-semibold">ES-SPX Basis</span>
          <span className="text-surface-muted ml-2">ES leads SPX by 2–5s; divergence signals an imminent move</span>
        </div>
        <div>
          <span className="text-orange-400 font-mono font-semibold">Gamma Exposure</span>
          <span className="text-surface-muted ml-2">Short-gamma dealers hedge dynamically, amplifying moves</span>
        </div>
      </div>
    </div>
  )
}
