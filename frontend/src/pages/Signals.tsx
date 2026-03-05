import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Scatter, ComposedChart, Area, AreaChart, Legend,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { FilterBar } from '../components/FilterBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useFilterStore } from '../store/filterStore'
import { usePullingStacking, useNetFlow, useBasis } from '../hooks/useChartData'

const TICK_STYLE = { fill: '#64748b', fontSize: 10 }
const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }

export function Signals() {
  const toParams = useFilterStore(s => s.toParams)
  const params = toParams()

  const { data: ps,      isLoading: psLoading }    = usePullingStacking(params)
  const { data: flow,    isLoading: flowLoading }   = useNetFlow(params)
  const { data: basis,   isLoading: basisLoading }  = useBasis(params)

  const psWithColor = useMemo(() => {
    if (!ps) return []
    return ps.map(d => ({
      ...d,
      pulling:  d.MBO_pulling_stacking < 0 ? d.spx_price : null,
      stacking: d.MBO_pulling_stacking > 0 ? d.spx_price : null,
    }))
  }, [ps])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Microstructure Signals</h1>
      <FilterBar />

      <div className="grid grid-cols-1 gap-4">
        {/* Pulling / Stacking on Price */}
        <ChartCard
          title="Pulling & Stacking Events on SPX Price"
          subtitle="Red = pulling (cancellations), Green = stacking (additions) — clusters precede directional moves"
        >
          {psLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={psWithColor}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tickFormatter={v => format(new Date(v), 'HH:mm')} tick={TICK_STYLE} />
                <YAxis tick={TICK_STYLE} domain={['auto', 'auto']} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => format(new Date(v), 'HH:mm:ss')} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line   dataKey="spx_price" name="SPX Price" stroke="#94a3b8" dot={false} strokeWidth={1.5} />
                <Scatter dataKey="pulling"  name="Pulling"   fill="#f87171" />
                <Scatter dataKey="stacking" name="Stacking"  fill="#34d399" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Delta-Adjusted Net Flow */}
        <ChartCard
          title="Delta-Adjusted Net Flow"
          subtitle="Persistent positive net delta = bullish pressure building"
        >
          {flowLoading ? <LoadingSpinner /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time_bucket" tickFormatter={v => format(new Date(v), 'HH:mm')} tick={TICK_STYLE} />
                <YAxis tick={TICK_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => format(new Date(v), 'HH:mm:ss')} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area dataKey="call_delta_flow" name="Call Delta Flow" stroke="#6366f1" fill="#6366f140" stackId="a" />
                <Area dataKey="put_delta_flow"  name="Put Delta Flow"  stroke="#f87171" fill="#f8717140" stackId="a" />
                <Line dataKey="net_delta"       name="Net Delta"       stroke="#fbbf24" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* ES vs SPX Basis */}
        <ChartCard
          title="ES vs SPX Basis — Lead/Lag Analysis"
          subtitle="ES typically leads SPX by 2–5 seconds. Basis divergence signals imminent price move."
        >
          {basisLoading ? <LoadingSpinner /> : (
            <div className="space-y-1">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={basis}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time_bucket" tickFormatter={v => format(new Date(v), 'HH:mm')} tick={TICK_STYLE} />
                  <YAxis tick={TICK_STYLE} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => format(new Date(v), 'HH:mm:ss')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="es_price"  name="ES (÷100)" stroke="#6366f1" dot={false} strokeWidth={1.5} />
                  <Line dataKey="spx_price" name="SPX"        stroke="#34d399" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={basis}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time_bucket" tickFormatter={v => format(new Date(v), 'HH:mm')} tick={TICK_STYLE} />
                  <YAxis tick={TICK_STYLE} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => format(new Date(v), 'HH:mm:ss')} />
                  <Line dataKey="basis" name="Basis" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
