interface KPICardProps {
  label: string
  value: string | number | null | undefined
  sub?: string
  accent?: 'green' | 'red' | 'blue' | 'default'
}

const accentMap = {
  green:   'text-emerald-400',
  red:     'text-red-400',
  blue:    'text-brand-500',
  default: 'text-white',
}

export function KPICard({ label, value, sub, accent = 'default' }: KPICardProps) {
  return (
    <div className="card flex flex-col gap-1 min-w-[130px]">
      <span className="label">{label}</span>
      <span className={`text-2xl font-semibold font-mono ${accentMap[accent]}`}>
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-surface-muted">{sub}</span>}
    </div>
  )
}
