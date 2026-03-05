import { useState, useMemo } from 'react'
import Plot from 'react-plotly.js'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { useCorrelation } from '../hooks/useChartData'

const GREEK_COLS = [
  'call_charm', 'call_delta', 'call_gamma', 'call_rho',
  'call_theta', 'call_vanna', 'call_vega',  'call_vomma',
  'put_charm',  'put_delta',  'put_gamma',  'put_rho',
  'put_theta',  'put_vanna',  'put_vega',   'put_vomma',
]

function CorrelationMatrix() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [drilldown, setDrilldown] = useState<{ i: number; j: number } | null>(null)
  const { data, isLoading } = useCorrelation(params)

  const plotData = useMemo(() => {
    if (!data?.matrix) return null
    return [{
      type: 'heatmap' as const,
      z: data.matrix,
      x: data.columns,
      y: data.columns,
      colorscale: [
        [0,   '#ef4444'],
        [0.5, '#1e293b'],
        [1,   '#3b82f6'],
      ],
      zmin: -1,
      zmax: 1,
      showscale: true,
      hovertemplate: '%{x} vs %{y}: %{z:.3f}<extra></extra>',
    }]
  }, [data])

  const drilldownInfo = useMemo(() => {
    if (!drilldown || !data) return null
    const { i, j } = drilldown
    return {
      col1: data.columns[i],
      col2: data.columns[j],
      corr: data.matrix[i][j],
    }
  }, [drilldown, data])

  return (
    <ChartCard
      title="Cross-Greek Correlation Matrix"
      subtitle="Pearson correlation across all 16 greek columns. High delta/vanna correlation = vol-driven hedging."
    >
      {isLoading ? <LoadingSpinner height="h-96" /> : plotData ? (
        <div>
          <Plot
            data={plotData as any[]}
            layout={{
              autosize: true,
              height: 500,
              paper_bgcolor: '#1e293b',
              plot_bgcolor: '#1e293b',
              font: { color: '#94a3b8', size: 10 },
              margin: { l: 100, r: 20, t: 20, b: 100 },
              xaxis: { tickangle: -45, gridcolor: '#334155' },
              yaxis: { gridcolor: '#334155' },
            }}
            config={{ displayModeBar: false }}
            style={{ width: '100%' }}
            useResizeHandler
            onClick={(e: { points: Array<{ x: unknown; y: unknown }> }) => {
              const pt = e.points[0]
              if (pt) setDrilldown({ i: pt.y as number, j: pt.x as number })
            }}
          />
          {drilldownInfo && (
            <div className="mt-3 p-3 bg-surface rounded-lg border border-surface-border text-sm">
              <span className="text-brand-500 font-mono">{drilldownInfo.col1}</span>
              <span className="text-surface-muted mx-2">vs</span>
              <span className="text-brand-500 font-mono">{drilldownInfo.col2}</span>
              <span className="text-surface-muted ml-2">Pearson r =</span>
              <span className={`ml-2 font-mono font-semibold ${Math.abs(drilldownInfo.corr) > 0.7 ? 'text-emerald-400' : Math.abs(drilldownInfo.corr) > 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                {drilldownInfo.corr.toFixed(4)}
              </span>
              <button className="ml-4 text-xs text-surface-muted hover:text-white" onClick={() => setDrilldown(null)}>
                Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center text-surface-muted text-sm">No data</div>
      )}
    </ChartCard>
  )
}

function QueryBuilder() {
  const {
    startDate, endDate, side, strikeMin, strikeMax, dteMin, dteMax,
    setFilter,
  } = useFilterStore()

  const handleExport = () => {
    const p = new URLSearchParams()
    if (startDate) p.set('start', startDate)
    if (endDate)   p.set('end', endDate)
    if (side)      p.set('side', side)
    if (strikeMin !== null) p.set('strike_min', String(strikeMin))
    if (strikeMax !== null) p.set('strike_max', String(strikeMax))
    p.set('limit', '100000')
    window.open(`/api/signals/pulling_stacking?${p.toString()}`, '_blank')
  }

  return (
    <ChartCard title="Custom Query Builder" subtitle="Filter and export the dataset as JSON (CSV export via API)">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <label className="label">Start Date</label>
          <input type="datetime-local" className="input" value={startDate} onChange={e => setFilter('startDate', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">End Date</label>
          <input type="datetime-local" className="input" value={endDate} onChange={e => setFilter('endDate', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Side</label>
          <select className="select" value={side} onChange={e => setFilter('side', e.target.value as 'Bid' | 'Ask' | '')}>
            <option value="">All</option>
            <option value="Bid">Bid</option>
            <option value="Ask">Ask</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Strike Min</label>
          <input type="number" className="input" value={strikeMin ?? ''} onChange={e => setFilter('strikeMin', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Strike Max</label>
          <input type="number" className="input" value={strikeMax ?? ''} onChange={e => setFilter('strikeMax', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">DTE Min</label>
          <input type="number" step="0.01" className="input" value={dteMin ?? ''} onChange={e => setFilter('dteMin', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button className="btn-primary" onClick={handleExport}>
          Export filtered data (JSON)
        </button>
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
        >
          API Docs
        </a>
      </div>
    </ChartCard>
  )
}

export function Analytics() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Analytics & Correlation</h1>
      <FilterBar />
      <CorrelationMatrix />
      <QueryBuilder />
    </div>
  )
}
