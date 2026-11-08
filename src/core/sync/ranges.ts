export interface SyncRange { from: string; to: string }
/** Coverage is established only by completed paginated source reads. End boundaries are exclusive. */
export function missingRanges(wanted: SyncRange, coverage: readonly SyncRange[], maxDays = 30): SyncRange[] {
  let cursor = Date.parse(wanted.from)
  const end = Date.parse(wanted.to), step = maxDays * 86400000
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor >= end || !Number.isFinite(step) || step <= 0) return []
  const gaps: SyncRange[] = []
  const add = (stop: number) => { while (cursor < stop) { const to = Math.min(stop, cursor + step); gaps.push({ from: new Date(cursor).toISOString(), to: new Date(to).toISOString() }); cursor = to } }
  for (const interval of coverage.map(row => [Date.parse(row.from), Date.parse(row.to)]).filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && from < to).sort((a, b) => a[0] - b[0])) {
    if (interval[1] <= cursor) continue
    if (interval[0] >= end) break
    if (interval[0] > cursor) add(Math.min(end, interval[0]))
    cursor = Math.max(cursor, interval[1])
    if (cursor >= end) break
  }
  add(end)
  return gaps
}
export function mergeCoverage(ranges: readonly SyncRange[]): SyncRange[] {
  const result: SyncRange[] = []
  for (const row of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
    const previous = result.at(-1)
    if (previous && Date.parse(row.from) <= Date.parse(previous.to)) previous.to = new Date(Math.max(Date.parse(row.to), Date.parse(previous.to))).toISOString()
    else result.push({ ...row })
  }
  return result
}
