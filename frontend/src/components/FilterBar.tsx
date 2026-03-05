import { useFilterStore } from '../store/filterStore'

export function FilterBar() {
  const { startDate, endDate, side, bucketMinutes, setFilter, reset } = useFilterStore()

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 card mb-4">
      <div className="flex flex-col gap-1">
        <label className="label">Start</label>
        <input
          type="datetime-local"
          className="input"
          value={startDate}
          onChange={e => setFilter('startDate', e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label">End</label>
        <input
          type="datetime-local"
          className="input"
          value={endDate}
          onChange={e => setFilter('endDate', e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label">Side</label>
        <select
          className="select"
          value={side}
          onChange={e => setFilter('side', e.target.value as 'Bid' | 'Ask' | '')}
        >
          <option value="">All</option>
          <option value="Bid">Bid</option>
          <option value="Ask">Ask</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="label">Bucket (min)</label>
        <select
          className="select"
          value={bucketMinutes}
          onChange={e => setFilter('bucketMinutes', Number(e.target.value))}
        >
          {[1, 5, 15, 30, 60].map(v => (
            <option key={v} value={v}>{v}m</option>
          ))}
        </select>
      </div>
      <button className="btn-ghost" onClick={reset}>Reset</button>
    </div>
  )
}
