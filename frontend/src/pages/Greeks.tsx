import { useState } from 'react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { useGreeksSurface, useVannaCharm, useTheta, useScatter } from '../hooks/useChartData'

const GREEK_OPTIONS = [
  'call_vega', 'call_gamma', 'call_vanna', 'call_delta',
  'call_theta', 'call_vomma', 'call_charm', 'call_rho',
]

const GREEK_DESCRIPTIONS: Record<string, { short: string; detail: string }> = {
  call_vega:  { short: 'Sensitivity to implied volatility', detail: 'A $1 rise in IV increases the call price by this amount. Peaks ATM and decays toward the wings. High vega concentration = IV moves cause large P&L swings here; watch for dealer vega-hedging flows when VIX spikes.' },
  call_gamma: { short: 'Rate of delta change per $1 SPX move', detail: 'Peaks sharply ATM near expiry. Dealers who are short gamma must buy into rallies and sell into dips to stay delta-neutral — this amplifies intraday spot moves. Gamma walls at crowded strikes create magnetic price levels.' },
  call_vanna: { short: 'dDelta / dVol — cross-exposure of delta to IV', detail: 'When IV falls, positive vanna strikes force dealers to buy deltas (rally fuel); when IV rises, they sell. The strongest vanna flip zones near ATM are key levels where a vol crush or spike mechanically moves spot.' },
  call_delta: { short: 'Dollar sensitivity to a $1 SPX move', detail: 'Ranges 0–1 for calls; deep ITM ≈ 1, deep OTM ≈ 0. Aggregated across all open interest, this is the net dealer hedge book. A large delta cluster means small SPX moves require significant share hedges.' },
  call_theta: { short: 'Daily time decay (P&L lost per day)', detail: 'Always negative for long options. Largest magnitude ATM and shortest DTE — option sellers collect this daily. Watch for theta cliffs near weekly expiry: rapid decay can force long-gamma holders to unwind, compressing realized vol.' },
  call_vomma: { short: 'dVega / dVol — vega sensitivity to IV', detail: 'Also called volga. High in the wings; tells you how much vega itself changes when vol moves. High vomma positions benefit from vol-of-vol regimes (e.g., tail events) but lose on mean-reverting vol. Upper-right of vega/vomma scatter = most sensitive to vol regime shifts.' },
  call_charm: { short: 'dDelta / dt — delta decay over time', detail: 'Tells dealers how much their delta hedge drifts overnight purely from time passing, with no price move. Largest near expiry and at low-delta OTM strikes. Monday-open rebalancing flows are partly driven by accumulated charm over the weekend.' },
  call_rho:   { short: 'Sensitivity to interest rates', detail: 'Positive for calls; a 1% rate rise increases call value by this amount. Small for short-dated SPX options but material for LEAPS. Relevant when Fed decisions are pending — rho-driven flows are slow-moving but persistent.' },
}

const TICK_STYLE = { fill: '#64748b', fontSize: 10 }
const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

export function Greeks() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [selectedGreek, setSelectedGreek] = useState('call_vega')
  const [metric, setMetric] = useState<'vanna' | 'charm'>('vanna')

  const { data: surface,    isLoading: surfaceLoading }  = useGreeksSurface(selectedGreek, params)
  const { data: vannaCharm, isLoading: vcLoading }       = useVannaCharm(metric, params)
  const { data: theta,      isLoading: thetaLoading }    = useTheta(params)
  const { data: scatter,    isLoading: scatterLoading }  = useScatter(params)

  // Single snapshot: all rows share one t value, so render as bar chart by strike
  const surfaceBars = surface
    ?.map(d => ({ spx_strike: d.spx_strike, value: d.greek_value }))
    .sort((a, b) => a.spx_strike - b.spx_strike) ?? []

  // Theta: single t per strike — render call vs put bars by strike
  const thetaBars = theta?.map(d => ({
    spx_strike: d.spx_strike,
    call_theta: d.call_theta,
    put_theta: d.put_theta,
  })).sort((a, b) => a.spx_strike - b.spx_strike) ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Options Greeks</h1>
      <FilterBar />

      <div className="grid grid-cols-1 gap-4">
        {/* Greek by Strike */}
        <ChartCard
          title="Greek Exposure by Strike"
          subtitle={GREEK_DESCRIPTIONS[selectedGreek]?.short}
          controls={
            <select className="select" value={selectedGreek} onChange={e => setSelectedGreek(e.target.value)}>
              {GREEK_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          }
        >
          {GREEK_DESCRIPTIONS[selectedGreek] && (
            <p className="text-xs text-surface-muted mb-3 leading-relaxed">
              {GREEK_DESCRIPTIONS[selectedGreek].detail}
            </p>
          )}
          {surfaceLoading ? <LoadingSpinner height="h-80" /> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={surfaceBars} barCategoryGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="spx_strike"
                  tick={TICK_STYLE}
                  interval={Math.max(1, Math.floor(surfaceBars.length / 10))}
                />
                <YAxis tick={TICK_STYLE} domain={['auto', 'auto']} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => v.toFixed(4)} />
                <Bar dataKey="value" name={selectedGreek} fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
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

          {/* Theta by Strike */}
          <ChartCard
            title="Theta by Strike"
            subtitle="Call and put theta at current DTE — larger negative = faster decay"
          >
            {thetaLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={thetaBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="spx_strike" tick={TICK_STYLE} interval={Math.max(1, Math.floor(thetaBars.length / 8))} />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => v.toFixed(4)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="call_theta" name="Call Theta" fill="#34d399" />
                  <Bar dataKey="put_theta"  name="Put Theta"  fill="#f87171" />
                </BarChart>
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
