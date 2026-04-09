import { useQuery } from '@tanstack/react-query'

// If VITE_API_URL is set, call the live API.
// Otherwise fall back to pre-built static JSON files in /data/ (GitHub Pages mode).
const API_URL = import.meta.env.VITE_API_URL ?? null
const STATIC_BASE = import.meta.env.BASE_URL + 'data'

/** Map an API path + key params to a static JSON filename. */
function staticFile(path: string, key?: string): string {
  // /signals/kpi → kpi.json
  // /greeks/surface + greek=call_vega → surface_call_vega.json
  // /greeks/vanna_charm + metric=vanna → vanna_charm_vanna.json
  const segment = path.split('/').filter(Boolean).pop()!
  const suffix = key ? `_${key}` : ''
  return `${STATIC_BASE}/${segment}${suffix}.json`
}

async function fetchJson<T>(path: string, params: Record<string, string> = {}, staticKey?: string): Promise<T> {
  if (API_URL) {
    const qs = new URLSearchParams(params).toString()
    const url = `${API_URL}${path}${qs ? '?' + qs : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
    return res.json()
  }
  // Static mode: ignore filter params (pre-built data)
  const url = staticFile(path, staticKey)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Static file not found: ${url}`)
  return res.json()
}

export function useKpi(params: Record<string, string>) {
  return useQuery({
    queryKey: ['kpi', params],
    queryFn: () => fetchJson<Record<string, unknown>>('/signals/kpi', params),
  })
}

export function useHeatmap(params: Record<string, string>) {
  return useQuery({
    queryKey: ['heatmap', params],
    queryFn: () => fetchJson<{ time_bucket: string; future_strike: number; total_size: number }[]>('/volume/heatmap', params),
  })
}

export function useHistogram(params: Record<string, string>) {
  return useQuery({
    queryKey: ['histogram', params],
    queryFn: () => fetchJson<{ mbo_value: number }[]>('/volume/histogram', params),
  })
}

export function useSpread(params: Record<string, string>) {
  return useQuery({
    queryKey: ['spread', params],
    queryFn: () => fetchJson<{ time_bucket: string; spread: number; spx_price: number }[]>('/volume/spread', params),
  })
}

export function useDepth(params: Record<string, string>) {
  return useQuery({
    queryKey: ['depth', params],
    queryFn: () => fetchJson<{ future_strike: number; Side: string; event_count: number; total_size: number }[]>('/volume/depth', params),
  })
}

export function usePullingStacking(params: Record<string, string>) {
  return useQuery({
    queryKey: ['pulling_stacking', params],
    queryFn: () => fetchJson<{ timestamp: string; spx_price: number; MBO_pulling_stacking: number }[]>('/signals/pulling_stacking', params),
  })
}

export function useNetFlow(params: Record<string, string>) {
  return useQuery({
    queryKey: ['net_flow', params],
    queryFn: () => fetchJson<{ time_bucket: string; call_delta_flow: number; put_delta_flow: number; net_delta: number }[]>('/signals/net_flow', params),
  })
}

export function useBasis(params: Record<string, string>) {
  return useQuery({
    queryKey: ['basis', params],
    queryFn: () => fetchJson<{ time_bucket: string; es_price: number; spx_price: number; basis: number }[]>('/signals/basis', params),
  })
}

export function useGreeksSurface(greek: string, params: Record<string, string>) {
  return useQuery({
    queryKey: ['greeks_surface', greek, params],
    queryFn: () => fetchJson<{ spx_strike: number; t: number; greek_value: number }[]>('/greeks/surface', { ...params, greek }, greek),
  })
}

export function useVannaCharm(metric: string, params: Record<string, string>) {
  return useQuery({
    queryKey: ['vanna_charm', metric, params],
    queryFn: () => fetchJson<{ spx_strike: number; call_value: number; put_value: number }[]>('/greeks/vanna_charm', { ...params, metric }, metric),
  })
}

export function useTheta(params: Record<string, string>) {
  return useQuery({
    queryKey: ['theta', params],
    queryFn: () => fetchJson<{ spx_strike: number; t: number; call_theta: number; put_theta: number }[]>('/greeks/theta', params),
  })
}

export function useScatter(params: Record<string, string>) {
  return useQuery({
    queryKey: ['scatter', params],
    queryFn: () => fetchJson<{ spx_strike: number; call_vega: number; call_vomma: number; mbo_count: number }[]>('/greeks/scatter', params),
  })
}

export function useGex(params: Record<string, string>) {
  return useQuery({
    queryKey: ['gex', params],
    queryFn: () => fetchJson<{ spx_strike: number; spx_price: number; long_gex: number; short_gex: number; net_gex: number }[]>('/greeks/gex', params),
  })
}

export function useGexIntraday(params: Record<string, string>) {
  return useQuery({
    queryKey: ['gex_intraday', params],
    queryFn: () => fetchJson<{ time_bucket: string; spx_price: number; net_gex: number; long_gex: number; short_gex: number }[]>('/greeks/gex_intraday', params),
  })
}

export function useCorrelation(params: Record<string, string>) {
  return useQuery({
    queryKey: ['correlation', params],
    queryFn: () => fetchJson<{ columns: string[]; matrix: number[][] }>('/greeks/correlation', params),
  })
}
