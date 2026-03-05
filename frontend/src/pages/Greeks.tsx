import { useState } from 'react'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import Plot from 'react-plotly.js'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { useGreeksSurface, useVannaCharm, useTheta, useScatter } from '../hooks/useChartData'

const GREEK_OPTIONS = [
  'call_vega', 'call_gamma', 'call_vanna', 'call_delta',
  'call_theta', 'call_vomma', 'call_charm', 'call_rho',
]
const TICK_STYLE = { fill: '#64748b', fontSize: 10 }
const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

const COLORS = ['#6366f1','#34d399','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb923c','#4ade80']

export function Greeks() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [selectedGreek, setSelectedGreek] = useState('call_vega')
  const [metric, setMetric] = useState<'vanna' | 'charm'>('vanna')

  const { data: surface,   isLoading: surfaceLoading }   = useGreeksSurface(selectedGreek, params)
  const { data: vannaCharm, isLoading: vcLoading }       = useVannaCharm(metric, params)
  const { data: theta,     isLoading: thetaLoading }     = useTheta(params)
  const { data: scatter,   isLoading: scatterLoading }   = useScatter(params)

  // Build Plotly surface data
  const plotData = (() => {
    if (!surface || !surface.length) return null
    const strikes = [...new Set(surface.map(d => d.spx_strike))].sort((a, b) => a - b)
    const ts = [...new Set(surface.map(d => d.t))].sort((a, b) => a - b)
    const zMap: Record<string, Record<string, number>> = {}
    surface.forEach(d => {
      if (!zMap[d.spx_strike]) zMap[d.spx_strike] = {}
      zMap[d.spx_strike][d.t] = d.greek_value
    })
    const z = strikes.map(s => ts.map(t => zMap[s]?.[t] ?? 0))
    return { x: ts, y: strikes, z }
  })()

  // Group theta by strike for multi-line chart
  const strikeGroups = (() => {
    if (!theta) return []
    const groups: Record<number, { t: number; call_theta: number; put_theta: number }[]> = {}
    theta.forEach(d => {
      if (!groups[d.spx_strike]) groups[d.spx_strike] = []
      groups[d.spx_strike].push({ t: d.t, call_theta: d.call_theta, put_theta: d.put_theta })
    })
    return Object.entries(groups)
      .slice(0, 6) // show at most 6 strikes
      .map(([strike, data]) => ({ strike: Number(strike), data: data.sort((a, b) => a.t - b.t) }))
  })()

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Options Greeks</h1>
      <FilterBar />

      <div className="grid grid-cols-1 gap-4">
        {/* 3D Greeks Surface */}
        <ChartCard
          title="Greeks Surface (3D)"
          subtitle="Strike × DTE × Greek value — high gamma near price = dealer hedge clusters"
          controls={
            <select className="select" value={selectedGreek} onChange={e => setSelectedGreek(e.target.value)}>
              {GREEK_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          }
        >
          {surfaceLoading ? <LoadingSpinner height="h-80" /> : plotData ? (
            <Plot
              data={[{
                type: 'surface',
                x: plotData.x,
                y: plotData.y,
                z: plotData.z,
                colorscale: 'Viridis',
                showscale: true,
              }] as any[]}
              layout={{
                autosize: true,
                height: 400,
                paper_bgcolor: '#1e293b',
                plot_bgcolor: '#1e293b',
                font: { color: '#94a3b8', size: 10 },
                margin: { l: 0, r: 0, t: 20, b: 0 },
                scene: {
                  xaxis: { title: 'DTE (t)', gridcolor: '#334155', zerolinecolor: '#475569' },
                  yaxis: { title: 'SPX Strike', gridcolor: '#334155', zerolinecolor: '#475569' },
                  zaxis: { title: selectedGreek, gridcolor: '#334155', zerolinecolor: '#475569' },
                },
              }}
              config={{ displayModeBar: false }}
              style={{ width: '100%' }}
              useResizeHandler
            />
          ) : (
            <div className="h-80 flex items-center justify-center text-surface-muted text-sm">No data</div>
          )}
        </ChartCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Vanna/Charm Exposure */}
          <ChartCard
            title="Vanna / Charm Exposure by Strike"
            subtitle="Net exposure drives mechanical delta hedging flows"
            controls={
              <div className="flex gap-1">
                <button className={metric === 'vanna' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMetric('vanna')}>Vanna</button>
                <button className={metric === 'charm' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMetric('charm')}>Charm</button>
              </div>
            }
          >
            {vcLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={vannaCharm}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="spx_strike" tick={TICK_STYLE} interval={Math.max(1, Math.floor((vannaCharm?.length || 1) / 8))} />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="call_value" name={`Call ${metric}`} fill="#6366f1" />
                  <Bar dataKey="put_value"  name={`Put ${metric}`}  fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Theta Decay */}
          <ChartCard
            title="Theta Decay Curves"
            subtitle="Theta accelerates nonlinearly after 21 DTE (t ≈ 0.058)"
          >
            {thetaLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" type="number" domain={['auto', 'auto']} tick={TICK_STYLE} label={{ value: 'DTE (t)', position: 'insideBottom', fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {strikeGroups.map((sg, i) => (
                    <Line
                      key={sg.strike}
                      data={sg.data}
                      dataKey="call_theta"
                      name={`Strike ${sg.strike}`}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={1.5}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Vomma vs Vega Scatter */}
          <ChartCard
            title="Vomma vs Vega Scatter"
            subtitle="Upper-right = highly sensitive to volatility-of-volatility regimes"
            className="xl:col-span-2"
          >
            {scatterLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="call_vega"  name="Call Vega"  tick={TICK_STYLE} label={{ value: 'Call Vega', position: 'insideBottom', fill: '#64748b', fontSize: 10, offset: -5 }} />
                  <YAxis dataKey="call_vomma" name="Call Vomma" tick={TICK_STYLE} label={{ value: 'Call Vomma', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                  <ZAxis dataKey="mbo_count" range={[20, 400]} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0].payload as { spx_strike: number; call_vega: number; call_vomma: number; mbo_count: number }
                      return (
                        <div className="bg-surface-card border border-surface-border rounded-lg p-2 text-xs space-y-0.5">
                          <div className="text-slate-300 font-mono">Strike: {d.spx_strike}</div>
                          <div className="text-surface-muted">Vega: {d.call_vega?.toFixed(4)}</div>
                          <div className="text-surface-muted">Vomma: {d.call_vomma?.toFixed(4)}</div>
                          <div className="text-surface-muted">MBO Count: {d.mbo_count}</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={scatter} fill="#6366f1" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
