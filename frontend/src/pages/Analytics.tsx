import { useState, useMemo } from 'react'
import Plot from 'react-plotly.js'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { useCorrelation } from '../hooks/useChartData'


/** Shorten `call_vega` → `C vega`, `put_charm` → `P charm` */
function shortLabel(col: string) {
  if (col.startsWith('call_')) return 'C ' + col.slice(5)
  if (col.startsWith('put_'))  return 'P ' + col.slice(4)
  return col
}

function greekName(col: string) {
  return col.replace('call_', '').replace('put_', '')
}

function describeCorrelation(col1: string, col2: string, r: number): string {
  if (col1 === col2) return 'Same greek — always 1.0 by definition.'

  const abs = Math.abs(r)
  const g1 = greekName(col1)
  const g2 = greekName(col2)
  const sameGreek = g1 === g2
  const crossSide = col1.slice(0, 4) !== col2.slice(0, 4)  // call vs put

  const strength =
    abs > 0.9 ? 'near-perfect' :
    abs > 0.7 ? 'strong' :
    abs > 0.5 ? 'moderate' :
    abs > 0.3 ? 'weak' : 'near-zero'

  const direction = r > 0 ? 'move together' : 'move in opposite directions'

  // Contextual insight based on which greeks are involved
  let insight = ''
  if (sameGreek && crossSide) {
    insight = r > 0
      ? `Call and put ${g1} both driven by the same macro factor — typical when a single regime (vol spike, spot move) dominates.`
      : `Call and put ${g1} diverging — points to skew or term-structure dislocation; one side is being re-priced independently.`
  } else if ((g1 === 'vanna' || g2 === 'vanna') && (g1 === 'delta' || g2 === 'delta')) {
    insight = abs > 0.5
      ? 'High vanna-delta link: IV moves are forcing delta re-hedging — dealer flows become non-linear when vol is moving.'
      : 'Low vanna-delta link: delta hedging and vol hedging are running on separate tracks right now.'
  } else if ((g1 === 'vanna' || g2 === 'vanna') && (g1 === 'vega' || g2 === 'vega')) {
    insight = abs > 0.5
      ? 'Vega and vanna aligned: IV moves change both option value and delta simultaneously — amplified hedging pressure.'
      : 'Vega and vanna decoupled: vol sensitivity and delta-vol sensitivity are not co-moving; surface is relatively stable.'
  } else if ((g1 === 'charm' || g2 === 'charm') && (g1 === 'delta' || g2 === 'delta')) {
    insight = abs > 0.5
      ? 'Charm-delta coupling: time decay is shifting delta systematically — expect ongoing dealer rebalancing into the close.'
      : 'Charm and delta are mostly independent: calendar drift is not adding to spot hedging pressure.'
  } else if (g1 === 'gamma' || g2 === 'gamma') {
    insight = abs > 0.5
      ? 'Gamma involvement: spot moves and convexity are linked — dealers face accelerating hedge costs as price moves.'
      : 'Weak gamma coupling: convexity risk is not amplifying the relationship here.'
  } else if (g1 === 'theta' || g2 === 'theta') {
    insight = abs > 0.5
      ? 'Theta strongly linked: time decay is correlated with this greek — expiry-driven flows may be material.'
      : 'Theta weakly linked: decay and this greek are running independently.'
  } else if (g1 === 'vomma' || g2 === 'vomma') {
    insight = abs > 0.5
      ? 'Vomma link present: vol-of-vol exposure is correlated — positions here are non-linearly sensitive to IV regimes.'
      : 'Low vomma coupling: vol regime shifts are not strongly feeding through this pair.'
  } else if (g1 === 'rho' || g2 === 'rho') {
    insight = 'Rho moves slowly; if it correlates here it likely reflects a shared strike/DTE structure, not an interest-rate signal.'
  }

  if (!insight) {
    insight = abs > 0.6
      ? 'These two greeks share a strong common driver — likely the same strikes or DTE cluster dominating both.'
      : abs > 0.3
      ? 'Partial overlap in drivers — they share some exposure but carry independent information too.'
      : 'Largely orthogonal — these greeks capture different dimensions of the options surface.'
  }

  const label1 = shortLabel(col1)
  const label2 = shortLabel(col2)
  return `<b>${label1} × ${label2}</b><br>r = ${r.toFixed(3)} · ${strength} ${r > 0 ? 'positive' : 'negative'}<br>${label1} and ${label2} ${direction}.<br>${insight}`
}

function CorrelationMatrix() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [drilldown, setDrilldown] = useState<{ col1: string; col2: string; corr: number } | null>(null)
  const { data, isLoading } = useCorrelation(params)

  const plotData = useMemo(() => {
    if (!data?.matrix) return null
    const n = data.columns.length
    const labels = data.columns.map(shortLabel)

    // Lower-triangle only — set upper triangle to null so cells are blank
    const z: (number | null)[][] = data.matrix.map((row, i) =>
      row.map((v, j) => (j > i ? null : v))
    )

    // Annotation text: show value for every visible cell
    const text: string[][] = z.map(row =>
      row.map(v => (v === null ? '' : v.toFixed(2)))
    )

    // Hover descriptions — one string per cell, passed via customdata
    const customdata: string[][] = data.matrix.map((row, i) =>
      row.map((v, j) => j > i ? '' : describeCorrelation(data.columns[i], data.columns[j], v))
    )

    return [{
      type: 'heatmap' as const,
      z,
      x: labels,
      y: labels,
      text,
      texttemplate: '%{text}',
      textfont: { size: 9, color: '#ffffff' },
      customdata,
      hovertemplate: '%{customdata}<extra></extra>',
      colorscale: 'RdBu',
      reversescale: true,
      zmin: -1,
      zmax: 1,
      showscale: true,
      colorbar: { thickness: 12, len: 0.8, tickfont: { size: 9, color: '#94a3b8' } },
      n,
    }]
  }, [data])

  return (
    <ChartCard
      title="Cross-Greek Correlation Matrix"
      subtitle="Lower triangle only — blue = strong positive, red = strong negative. Click a cell for interpretation."
    >
      {isLoading ? <LoadingSpinner height="h-96" /> : plotData ? (
        <div>
          <Plot
            data={plotData as any[]}
            layout={{
              autosize: true,
              height: 520,
              paper_bgcolor: 'transparent',
              plot_bgcolor: '#0f172a',
              font: { color: '#94a3b8', size: 10 },
              margin: { l: 80, r: 60, t: 10, b: 80 },
              xaxis: { tickangle: -40, gridcolor: '#1e293b', tickfont: { size: 10 } },
              yaxis: { gridcolor: '#1e293b', tickfont: { size: 10 }, autorange: 'reversed' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            useResizeHandler
            onClick={(e: any) => {
              const pt = e.points?.[0]
              if (!pt || pt.z == null) return
              const cols = data!.columns
              const col1 = cols.find(c => shortLabel(c) === pt.y) ?? pt.y
              const col2 = cols.find(c => shortLabel(c) === pt.x) ?? pt.x
              setDrilldown({ col1, col2, corr: pt.z as number })
            }}
          />
          {drilldown ? (
            <div className="mt-3 p-3 bg-surface rounded-lg border border-surface-border text-sm space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-brand-400 font-mono">{drilldown.col1}</span>
                <span className="text-surface-muted">×</span>
                <span className="text-brand-400 font-mono">{drilldown.col2}</span>
                <span className="text-surface-muted ml-1">Pearson r =</span>
                <span className={`font-mono font-semibold ${
                  Math.abs(drilldown.corr) > 0.7 ? 'text-emerald-400' :
                  Math.abs(drilldown.corr) > 0.4 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {drilldown.corr.toFixed(4)}
                </span>
                <button className="ml-auto text-xs text-surface-muted hover:text-white" onClick={() => setDrilldown(null)}>
                  ✕ Clear
                </button>
              </div>
              <p className="text-xs text-surface-muted leading-relaxed">
                {Math.abs(drilldown.corr) > 0.85
                  ? 'Very strong relationship — these greeks move nearly in lockstep. Using both in a model adds little independent information.'
                  : Math.abs(drilldown.corr) > 0.6
                  ? 'Moderate-to-strong relationship — correlated but not redundant. Divergences between them can signal regime shifts.'
                  : Math.abs(drilldown.corr) > 0.3
                  ? 'Weak relationship — these greeks are largely independent. Both carry distinct information about the options surface.'
                  : 'Near-zero correlation — effectively orthogonal risk factors. Combining them gives diversified exposure.'}
                {drilldown.corr < 0
                  ? ' The negative sign means they move in opposite directions.'
                  : ' The positive sign means they tend to move together.'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-surface-muted text-center">Click any cell for interpretation</p>
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
