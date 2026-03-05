import { create } from 'zustand'

export interface FilterState {
  startDate: string
  endDate: string
  side: 'Bid' | 'Ask' | ''
  strikeMin: number | null
  strikeMax: number | null
  dteMin: number | null
  dteMax: number | null
  bucketMinutes: number
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  reset: () => void
  toParams: () => Record<string, string>
}

const defaults = {
  startDate: '',
  endDate: '',
  side: '' as const,
  strikeMin: null,
  strikeMax: null,
  dteMin: null,
  dteMax: null,
  bucketMinutes: 1,
}

export const useFilterStore = create<FilterState>((set, get) => ({
  ...defaults,
  setFilter: (key, value) => set({ [key]: value } as Partial<FilterState>),
  reset: () => set(defaults),
  toParams: () => {
    const s = get()
    const p: Record<string, string> = {}
    if (s.startDate) p.start = s.startDate
    if (s.endDate)   p.end   = s.endDate
    if (s.side)      p.side  = s.side
    if (s.strikeMin !== null) p.strike_min = String(s.strikeMin)
    if (s.strikeMax !== null) p.strike_max = String(s.strikeMax)
    if (s.dteMin !== null)    p.dte_min    = String(s.dteMin)
    if (s.dteMax !== null)    p.dte_max    = String(s.dteMax)
    p.bucket_minutes = String(s.bucketMinutes)
    return p
  },
}))
