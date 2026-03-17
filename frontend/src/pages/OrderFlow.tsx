import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { useHeatmap, useHistogram, useSpread, useDepth } from '../hooks/useChartData'

export function OrderFlow() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [logScale, setLogScale] = useState(false)

  const { data: heatmap, isLoading: heatLoading } = useHeatmap(params)
  const { data: histogram, isLoading: histLoading } = useHistogram(params)
  const { data: spread, isLoading: spreadLoading } = useSpread(params)
  const { data: depth, isLoading: depthLoading } = useDepth(params)

  // Histogram: bin by value for bar chart
  const histBins = useMemo(() => {
    if (!histogram) return []
    const vals = histogram.map(d => d.mbo_value).filter(v => v > 0)
    if (!vals.length) return []
    const max = Math.max(...vals)
    const bins = 40
    const step = max / bins
    const counts = new Array(bins).fill(0)
    vals.forEach(v => {
      const idx = Math.min(Math.floor(v / step), bins - 1)
      counts[idx]++
    })
    return counts.map((c, i) => ({ range: `${(i * step).toFixed(0)}`, count: c }))
  }, [histogram])

  // Depth: separate bid and ask, limited to top 40 strikes by combined volume
  const depthData = useMemo(() => {
    if (!depth) return []
    const byStrike: Record<number, { strike: number; bid: number; ask: number }> = {}
    depth.forEach(d => {
      if (!byStrike[d.future_strike]) byStrike[d.future_strike] = { strike: d.future_strike, bid: 0, ask: 0 }
      if (d.Side === 'Bid') byStrike[d.future_strike].bid = d.total_size ?? 0
      if (d.Side === 'Ask') byStrike[d.future_strike].ask = -(d.total_size ?? 0)
    })
    return Object.values(byStrike)
      .sort((a, b) => (Math.abs(b.bid) + Math.abs(b.ask)) - (Math.abs(a.bid) + Math.abs(a.ask)))
      .slice(0, 40)
      .sort((a, b) => a.strike - b.strike)
  }, [depth])

  // Heatmap: aggregate strikes as a time series for quick preview
  const heatSeries = useMemo(() => {
    if (!heatmap) return []
    const byTime: Record<string, number> = {}
    heatmap.forEach(d => {
      byTime[d.time_bucket] = (byTime[d.time_bucket] || 0) + (d.total_size || 0)
    })
    return Object.entries(byTime)
      .map(([t, v]) => ({ time_bucket: t, total_size: v }))
      .sort((a, b) => a.time_bucket.localeCompare(b.time_bucket))
  }, [heatmap])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Order Flow</h1>
      <FilterBar />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Volume Heatmap (time-series aggregate) */}
        <ChartCard
          title="MBO Volume Over Time"
          subtitle="Total order size per time bucket (all strikes aggregated)"
        >
          {heatLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={heatSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time_bucket" tickFormatter={v => format(new Date(v.replace(' ', 'T')), 'HH:mm')} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm:ss')} />
                <Line dataKey="total_size" name="Total MBO Size" stroke="#6366f1" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Order Size Histogram */}
        <ChartCard
          title="MBO Order Size Histogram"
          subtitle="Distribution of individual order sizes from MBO lists"
          controls={
            <button className={logScale ? 'btn-primary' : 'btn-ghost'} onClick={() => setLogScale(!logScale)}>
              {logScale ? 'Log' : 'Linear'}
            </button>
          }
        >
          {histLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={histBins} barCategoryGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 9 }} interval={4} />
                <YAxis scale={logScale ? 'log' : 'auto'} domain={logScale ? [1, 'auto'] : [0, 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Bar dataKey="count" name="Count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Bid-Ask Spread */}
        <ChartCard
          title="Bid-Ask Spread vs SPX Price"
          subtitle="Widening spread before a large price move is a microstructure signal"
        >
          {spreadLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={spread}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time_bucket" tickFormatter={v => format(new Date(v), 'HH:mm')} tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelFormatter={v => format(new Date(v), 'HH:mm:ss')} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left"  dataKey="spread"    name="Spread" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line yAxisId="right" dataKey="spx_price" name="SPX"    stroke="#34d399" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Order Book Depth */}
        <ChartCard
          title="Order Book Depth Waterfall"
          subtitle="Bid (positive) vs Ask (negative) total MBO size per ES strike"
        >
          {depthLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={depthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="strike" tick={{ fill: '#64748b', fontSize: 9 }} interval={Math.max(1, Math.floor((depthData.length || 1) / 10))} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={(v: number) => Math.abs(v).toFixed(0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bid" name="Bid" fill="#34d399" />
                <Bar dataKey="ask" name="Ask" fill="#f87171" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
