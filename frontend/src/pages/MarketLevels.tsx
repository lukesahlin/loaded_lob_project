import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ComposedChart, Line, Legend,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { KPICard } from '../components/KPICard'
import { LoadingSpinner, ErrorMsg } from '../components/LoadingSpinner'
import { useGex, useGexIntraday } from '../hooks/useChartData'
import { useFilterStore } from '../store/filterStore'

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function fmtGex(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(2)
}

/** Compute key levels from the GEX profile */
function computeLevels(data: { spx_strike: number; spx_price: number; net_gex: number }[]) {
  if (!data || data.length === 0) return null

  const currentPrice = data.reduce((sum, d) => sum + d.spx_price, 0) / data.length
  const totalNetGex  = data.reduce((sum, d) => sum + d.net_gex, 0)

  // Largest absolute GEX strike — strongest dealer hedging concentration
  const pinStrike = data.reduce((max, d) =>
    Math.abs(d.net_gex) > Math.abs(max.net_gex) ? d : max
  ).spx_strike

  // GEX flip point: first strike where sign changes from + to - (descending by strike)
  const sorted = [...data].sort((a, b) => b.spx_strike - a.spx_strike)
  let flipPoint: number | null = null
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].net_gex > 0 && sorted[i].net_gex <= 0) {
      flipPoint = (sorted[i - 1].spx_strike + sorted[i].spx_strike) / 2
      break
    }
  }

  // Long wall: highest long_gex strike (dealers most long gamma here — strongest pin)
  // Short wall: highest short_gex strike (dealers most short gamma — most volatile)
  const maxLongGex  = (data as any[]).reduce((max: any, d: any) =>
    (d.long_gex ?? 0) > (max.long_gex ?? 0) ? d : max
  )
  const maxShortGex = (data as any[]).reduce((max: any, d: any) =>
    (d.short_gex ?? 0) > (max.short_gex ?? 0) ? d : max
  )

  return { currentPrice, totalNetGex, pinStrike, flipPoint, callWall: maxLongGex.spx_strike, putWall: maxShortGex.spx_strike }
}

function RegimeCard({ totalNetGex, flipPoint, currentPrice }: {
  totalNetGex: number | null
  flipPoint: number | null
  currentPrice: number | null
}) {
  if (totalNetGex === null) return null
  const isLongGamma = totalNetGex > 0
  const aboveFlip   = flipPoint !== null && currentPrice !== null && currentPrice > flipPoint

  return (
    <div className={`rounded-xl border p-4 ${isLongGamma ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-red-500/40 bg-red-950/30'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${isLongGamma ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-sm font-semibold text-white">Dealer Positioning</span>
        <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${isLongGamma ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
          {isLongGamma ? 'LONG GAMMA' : 'SHORT GAMMA'}
        </span>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-3">
        {isLongGamma
          ? 'Dealers are net long gamma. They buy dips and sell rips to stay delta-neutral, acting as a natural stabiliser. Expect mean-reverting, choppier price action.'
          : 'Dealers are net short gamma. They must buy into rallies and sell into drops, amplifying moves. Trending, directional price action is more likely.'}
      </p>

      {flipPoint !== null && (
        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>GEX Flip Point</span>
            <span className="font-mono text-white">{fmt(flipPoint, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Price vs. Flip</span>
            <span className={`font-mono ${aboveFlip ? 'text-emerald-400' : 'text-red-400'}`}>
              {aboveFlip ? '▲ Above (stable zone)' : '▼ Below (volatile zone)'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const CustomGexTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <div className="font-mono font-semibold text-white">Strike {fmt(d.spx_strike)}</div>
      <div className="flex gap-4 pt-1">
        <span className="text-emerald-400">Long GEX <span className="font-mono text-white">{fmtGex(d.long_gex)}</span></span>
        <span className="text-red-400">Short GEX <span className="font-mono text-white">{fmtGex(d.short_gex)}</span></span>
      </div>
      <div className={`font-mono font-semibold ${d.net_gex >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
        Net {fmtGex(d.net_gex)}
      </div>
    </div>
  )
}

const CustomIntradayTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <div className="font-mono text-slate-400">{label ? format(new Date(String(label).replace(' ', 'T')), 'HH:mm') : ''}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-mono">{typeof p.value === 'number' && Math.abs(p.value) > 100 ? fmtGex(p.value) : fmt(p.value, 2)}</span>
        </div>
      ))}
    </div>
  )
}

export function MarketLevels() {
  const startDate     = useFilterStore(s => s.startDate)
  const endDate       = useFilterStore(s => s.endDate)
  const bucketMinutes = useFilterStore(s => s.bucketMinutes)
  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (startDate) p.start = startDate
    if (endDate)   p.end   = endDate
    p.bucket_minutes = String(bucketMinutes)
    return p
  }, [startDate, endDate, bucketMinutes])
  const { data: gex,         isLoading: gexLoading,      error: gexError }      = useGex(params)
  const { data: gexIntraday, isLoading: intradayLoading                   }      = useGexIntraday(params)

  const levels = useMemo(() => computeLevels(gex ?? []), [gex])

  // Filter strikes within ±8% of current price for the chart (keeps it readable)
  const chartData = useMemo(() => {
    if (!gex || !levels) return gex ?? []
    const lo = levels.currentPrice * 0.92
    const hi = levels.currentPrice * 1.08
    return gex.filter(d => d.spx_strike >= lo && d.spx_strike <= hi)
  }, [gex, levels])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Market Levels</h1>
        <p className="text-sm text-surface-muted mt-1">
          Gamma Exposure profile — where dealers hedge, price tends to pin or accelerate
        </p>
      </div>

      {/* KPI Row */}
      {gexLoading ? (
        <LoadingSpinner height="h-20" />
      ) : gexError ? (
        <ErrorMsg message="Failed to load GEX data" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPICard
            label="SPX Price"
            value={fmt(levels?.currentPrice, 2)}
            accent="blue"
          />
          <KPICard
            label="GEX Flip Point"
            value={levels?.flipPoint != null ? fmt(levels.flipPoint, 0) : 'None found'}
            sub={levels?.flipPoint != null && levels?.currentPrice != null
              ? levels.currentPrice > levels.flipPoint ? '▲ Price above flip' : '▼ Price below flip'
              : undefined}
            accent={levels?.currentPrice != null && levels?.flipPoint != null
              ? levels.currentPrice > levels.flipPoint ? 'green' : 'red'
              : undefined}
          />
          <KPICard
            label="Largest Pin"
            value={fmt(levels?.pinStrike, 0)}
            sub="Max |GEX| strike"
          />
          <KPICard
            label="Long GEX Wall"
            value={fmt(levels?.callWall, 0)}
            sub="Dealers most long gamma"
            accent="green"
          />
          <KPICard
            label="Short GEX Wall"
            value={fmt(levels?.putWall, 0)}
            sub="Dealers most short gamma"
            accent="red"
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* GEX by Strike — main chart, takes 2/3 width */}
        <div className="xl:col-span-2">
          <ChartCard
            title="GEX by Strike (±8% of price)"
            subtitle="Teal = dealer long gamma (bid flow) · Pink = dealer short gamma (ask flow)"
          >
            {gexLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 540 }}>
                <ResponsiveContainer width="100%" height={Math.max(440, chartData.length * 22)}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    barGap={1}
                    barCategoryGap="20%"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      tickFormatter={fmtGex}
                      domain={[0, 'auto']}
                    />
                    <YAxis
                      type="category"
                      dataKey="spx_strike"
                      tick={({ x, y, payload }) => {
                        const isNearPrice = levels?.currentPrice != null &&
                          Math.abs(Number(payload.value) - levels.currentPrice) <= 2
                        return (
                          <text x={x} y={y} dy={4} textAnchor="end" fontSize={10}
                            fill={isNearPrice ? '#f59e0b' : '#64748b'}
                            fontWeight={isNearPrice ? 700 : 400}>
                            {fmt(Number(payload.value), 0)}
                            {isNearPrice ? ' ◀' : ''}
                          </text>
                        )
                      }}
                      width={64}
                    />
                    <Tooltip content={<CustomGexTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="long_gex"  name="Long (Bid)"  fill="#34d399" fillOpacity={0.85} radius={[0, 3, 3, 0]} />
                    <Bar dataKey="short_gex" name="Short (Ask)" fill="#f87171" fillOpacity={0.85} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Right column: regime card + intraday */}
        <div className="space-y-4">
          {!gexLoading && levels && (
            <RegimeCard
              totalNetGex={levels.totalNetGex}
              flipPoint={levels.flipPoint}
              currentPrice={levels.currentPrice}
            />
          )}

          <ChartCard
            title="Net GEX Intraday"
            subtitle="Aggregate dealer gamma exposure across the session"
          >
            {intradayLoading ? (
              <LoadingSpinner />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={gexIntraday ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="time_bucket"
                    tickFormatter={v => format(new Date(String(v).replace(' ', 'T')), 'HH:mm')}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="gex"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={fmtGex}
                    domain={['auto', 'auto']}
                    width={42}
                  />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    domain={['auto', 'auto']}
                    width={52}
                  />
                  <Tooltip content={<CustomIntradayTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="gex" y={0} stroke="#475569" strokeWidth={1} />
                  <Bar yAxisId="gex" dataKey="net_gex" name="Net GEX" radius={[2, 2, 0, 0]}>
                    {(gexIntraday ?? []).map((entry, i) => (
                      <Cell key={i} fill={entry.net_gex >= 0 ? '#34d399' : '#f87171'} fillOpacity={0.7} />
                    ))}
                  </Bar>
                  <Line yAxisId="price" dataKey="spx_price" name="SPX" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Level legend */}
          <div className="card text-xs space-y-2">
            <div className="text-slate-300 font-semibold mb-2">How to read GEX levels</div>
            <div className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-0.5 flex-shrink-0" />
              <span className="text-surface-muted"><span className="text-white">Positive GEX</span> — dealers bought gamma here. They sell into strength, buy weakness → price stabilises / pins.</span>
            </div>
            <div className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-surface-muted"><span className="text-white">Negative GEX</span> — dealers sold gamma here. They chase the move → price accelerates through these strikes.</span>
            </div>
            <div className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400 mt-0.5 flex-shrink-0" />
              <span className="text-surface-muted"><span className="text-white">SPX line</span> — current price. Pin risk highest at the nearest large positive GEX strike.</span>
            </div>
            <div className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 mt-0.5 flex-shrink-0" />
              <span className="text-surface-muted"><span className="text-white">Flip line</span> — GEX zero crossing. Above = stabilising regime. Below = trending regime.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
