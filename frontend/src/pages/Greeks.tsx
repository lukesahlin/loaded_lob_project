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

const GREEK_LABELS: Record<string, string> = {
  call_vega:  'Vega',
  call_gamma: 'Gamma',
  call_vanna: 'Vanna',
  call_delta: 'Delta',
  call_theta: 'Theta',
  call_vomma: 'Vomma',
  call_charm: 'Charm',
  call_rho:   'Rho',
}

const GREEK_SYMBOLS: Record<string, string> = {
  call_vega:  'ν',
  call_gamma: 'Γ',
  call_vanna: 'dΔ/dσ',
  call_delta: 'Δ',
  call_theta: 'Θ',
  call_vomma: 'dν/dσ',
  call_charm: 'dΔ/dt',
  call_rho:   'ρ',
}

const GREEK_DESCRIPTIONS: Record<string, { short: string; detail: string; color: string }> = {
  call_vega:  { short: 'Sensitivity to implied volatility', detail: 'A $1 rise in IV increases the call price by this amount. Peaks ATM and decays toward the wings. High vega concentration = IV moves cause large P&L swings here; watch for dealer vega-hedging flows when VIX spikes.', color: '#6366f1' },
  call_gamma: { short: 'Rate of delta change per $1 SPX move', detail: 'Peaks sharply ATM near expiry. Dealers who are short gamma must buy into rallies and sell into dips to stay delta-neutral — this amplifies intraday spot moves. Gamma walls at crowded strikes create magnetic price levels.', color: '#f59e0b' },
  call_vanna: { short: 'Cross-exposure of delta to implied vol', detail: 'When IV falls, positive vanna strikes force dealers to buy deltas (rally fuel); when IV rises, they sell. The strongest vanna flip zones near ATM are key levels where a vol crush or spike mechanically moves spot.', color: '#06b6d4' },
  call_delta: { short: 'Dollar sensitivity to a $1 SPX move', detail: 'Ranges 0–1 for calls; deep ITM ≈ 1, deep OTM ≈ 0. Aggregated across all open interest, this is the net dealer hedge book. A large delta cluster means small SPX moves require significant share hedges.', color: '#10b981' },
  call_theta: { short: 'Daily time decay — P&L lost per day', detail: 'Always negative for long options. Largest magnitude ATM and shortest DTE — option sellers collect this daily. Watch for theta cliffs near weekly expiry: rapid decay can force long-gamma holders to unwind, compressing realized vol.', color: '#f87171' },
  call_vomma: { short: 'How much vega itself changes when vol moves', detail: 'Also called volga. High in the wings; tells you how much vega itself changes when vol moves. High vomma positions benefit from vol-of-vol regimes (e.g., tail events) but lose on mean-reverting vol. Upper-right of vega/vomma scatter = most sensitive to vol regime shifts.', color: '#a78bfa' },
  call_charm: { short: 'How fast delta decays as time passes', detail: 'Tells dealers how much their delta hedge drifts overnight purely from time passing, with no price move. Largest near expiry and at low-delta OTM strikes. Monday-open rebalancing flows are partly driven by accumulated charm over the weekend.', color: '#fb923c' },
  call_rho:   { short: 'Sensitivity to interest rates', detail: 'Positive for calls; a 1% rate rise increases call value by this amount. Small for short-dated SPX options but material for LEAPS. Relevant when Fed decisions are pending — rho-driven flows are slow-moving but persistent.', color: '#34d399' },
}

const GLOSSARY_CARDS = [
  { key: 'call_delta',  category: 'First-order' },
  { key: 'call_gamma',  category: 'First-order' },
  { key: 'call_theta',  category: 'First-order' },
  { key: 'call_vega',   category: 'First-order' },
  { key: 'call_rho',    category: 'First-order' },
  { key: 'call_vanna',  category: 'Second-order' },
  { key: 'call_charm',  category: 'Second-order' },
  { key: 'call_vomma',  category: 'Second-order' },
]

const TICK_STYLE = { fill: '#64748b', fontSize: 10 }
const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

export function Greeks() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()
  const [selectedGreek, setSelectedGreek] = useState('call_vega')
  const [metric, setMetric] = useState<'vanna' | 'charm'>('vanna')
  const [glossaryOpen, setGlossaryOpen] = useState(false)

  const { data: surface,    isLoading: surfaceLoading }  = useGreeksSurface(selectedGreek, params)
  const { data: vannaCharm, isLoading: vcLoading }       = useVannaCharm(metric, params)
  const { data: theta,      isLoading: thetaLoading }    = useTheta(params)
  const { data: scatter,    isLoading: scatterLoading }  = useScatter(params)

  const surfaceBars = surface
    ?.map(d => ({ spx_strike: d.spx_strike, value: d.greek_value }))
    .sort((a, b) => a.spx_strike - b.spx_strike) ?? []

  const thetaBars = theta?.map(d => ({
    spx_strike: d.spx_strike,
    call_theta: d.call_theta,
    put_theta: d.put_theta,
  })).sort((a, b) => a.spx_strike - b.spx_strike) ?? []

  const metricKey = `call_${metric}` as keyof typeof GREEK_DESCRIPTIONS

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Options Greeks</h1>
        <button
          className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
          onClick={() => setGlossaryOpen(o => !o)}
        >
          <span className="text-base leading-none">{glossaryOpen ? '▾' : '▸'}</span>
          What are the Greeks?
        </button>
      </div>

      {glossaryOpen && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
          <p className="text-xs text-surface-muted leading-relaxed">
            Options Greeks measure how an option's price changes in response to different market variables.
            First-order Greeks describe direct sensitivities; second-order Greeks describe how those sensitivities themselves change.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {GLOSSARY_CARDS.filter(c => c.category === 'First-order').map(({ key }) => {
              const d = GREEK_DESCRIPTIONS[key]
              const label = GREEK_LABELS[key]
              const symbol = GREEK_SYMBOLS[key]
              return (
                <div key={key} className="rounded-lg border border-surface-border bg-surface-base p-3 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-lg font-bold" style={{ color: d.color }}>{symbol}</span>
                    <span className="text-sm font-semibold text-white">{label}</span>
                    <span className="ml-auto text-[10px] text-surface-muted">1st order</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-snug">{d.short}</p>
                  <p className="text-[11px] text-surface-muted leading-snug">{d.detail}</p>
                </div>
              )
            })}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-surface-muted mb-2">Second-order (how first-order Greeks change)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GLOSSARY_CARDS.filter(c => c.category === 'Second-order').map(({ key }) => {
                const d = GREEK_DESCRIPTIONS[key]
                const label = GREEK_LABELS[key]
                const symbol = GREEK_SYMBOLS[key]
                return (
                  <div key={key} className="rounded-lg border border-surface-border bg-surface-base p-3 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold" style={{ color: d.color }}>{symbol}</span>
                      <span className="text-sm font-semibold text-white">{label}</span>
                      <span className="ml-auto text-[10px] text-surface-muted">2nd order</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-snug">{d.short}</p>
                    <p className="text-[11px] text-surface-muted leading-snug">{d.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <FilterBar />

      <div className="grid grid-cols-1 gap-4">
        {/* Greek by Strike */}
        <ChartCard
          title="Greek Exposure by Strike"
          subtitle={GREEK_DESCRIPTIONS[selectedGreek]?.short}
          controls={
            <select className="select" value={selectedGreek} onChange={e => setSelectedGreek(e.target.value)}>
              {GREEK_OPTIONS.map(g => (
                <option key={g} value={g}>
                  {GREEK_SYMBOLS[g]}  {GREEK_LABELS[g]}
                </option>
              ))}
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
                <Bar dataKey="value" name={GREEK_LABELS[selectedGreek]} fill={GREEK_DESCRIPTIONS[selectedGreek]?.color ?? '#6366f1'} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Vanna/Charm Exposure */}
          <ChartCard
            title="Vanna / Charm Exposure by Strike"
            subtitle={GREEK_DESCRIPTIONS[metricKey]?.short}
            controls={
              <div className="flex gap-1">
                <button className={metric === 'vanna' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMetric('vanna')}>Vanna</button>
                <button className={metric === 'charm' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMetric('charm')}>Charm</button>
              </div>
            }
          >
            <p className="text-xs text-surface-muted mb-3 leading-relaxed">
              {GREEK_DESCRIPTIONS[metricKey]?.detail}
            </p>
            {vcLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={vannaCharm}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="spx_strike" tick={TICK_STYLE} interval={Math.max(1, Math.floor((vannaCharm?.length || 1) / 8))} />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="call_value" name={`Call ${GREEK_LABELS[metricKey]}`} fill="#6366f1" />
                  <Bar dataKey="put_value"  name={`Put ${GREEK_LABELS[metricKey]}`}  fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Theta by Strike */}
          <ChartCard
            title="Theta (Θ) by Strike"
            subtitle={GREEK_DESCRIPTIONS['call_theta'].short}
          >
            <p className="text-xs text-surface-muted mb-3 leading-relaxed">
              {GREEK_DESCRIPTIONS['call_theta'].detail}
            </p>
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
            <p className="text-xs text-surface-muted mb-3 leading-relaxed">
              {GREEK_DESCRIPTIONS['call_vomma'].detail} Bubble size reflects open interest volume at that strike.
            </p>
            {scatterLoading ? <LoadingSpinner /> : (
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="call_vega"  name="Call Vega"  tick={TICK_STYLE} label={{ value: 'Call Vega (ν)', position: 'insideBottom', fill: '#64748b', fontSize: 10, offset: -5 }} />
                  <YAxis dataKey="call_vomma" name="Call Vomma" tick={TICK_STYLE} label={{ value: 'Call Vomma (dν/dσ)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
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
                          <div className="text-surface-muted">Vega (ν): {d.call_vega?.toFixed(4)}</div>
                          <div className="text-surface-muted">Vomma (dν/dσ): {d.call_vomma?.toFixed(4)}</div>
                          <div className="text-surface-muted">Volume: {d.mbo_count}</div>
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
