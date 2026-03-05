import { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  controls?: ReactNode
}

export function ChartCard({ title, subtitle, children, className = '', controls }: ChartCardProps) {
  return (
    <div className={`card flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {subtitle && <p className="text-xs text-surface-muted mt-0.5">{subtitle}</p>}
        </div>
        {controls && <div className="flex items-center gap-2 flex-shrink-0">{controls}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
