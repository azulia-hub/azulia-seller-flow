import { toIndiaDateString } from '../sync/planner'

export interface PayoutGroup {
  readonly id: string
  readonly startedAt: string
  readonly transferAt: string | null
  readonly open: boolean
  readonly transferSucceeded: boolean
  readonly amountMinor: number | null
}

export interface PayoutSnapshot {
  readonly groups: readonly PayoutGroup[]
  readonly observedAt: string
}

const dayMs = 86400000
const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10)

export function weeklyPayout(
  groups: readonly PayoutGroup[],
  channelByGroup: ReadonlyMap<string, string>,
  channels: readonly string[],
  today: string,
  cadenceDays: number,
) {
  const todayTime = Date.parse(today)
  const monday = todayTime - ((new Date(todayTime).getUTCDay() + 6) % 7) * dayMs
  const from = dateKey(monday), to = dateKey(monday + 6 * dayMs)
  const weekGroups = [...new Map(groups.map(group => [group.id, group])).values()].flatMap(group => {
    const estimatedAt = Date.parse(group.startedAt) + cadenceDays * dayMs
    const date = toIndiaDateString(group.transferAt ?? (group.open ? estimatedAt : null))
    return date && date >= from && date <= to ? [{ ...group, date, channel: channelByGroup.get(group.id) }] : []
  })
  const rows = channels.map(channel => {
    const entries = weekGroups.filter(group => group.channel === channel).map(group => ({
      ...group,
      expectedMinor: group.amountMinor === null ? null :
        group.open || group.transferSucceeded || group.amountMinor <= 0 ? Math.max(0, group.amountMinor) : null,
    }))
    return { channel, entries }
  })
  const unclassifiedCount = weekGroups.filter(group => !group.channel || !channels.includes(group.channel)).length
  const complete = !unclassifiedCount && rows.every(row => row.entries.length && row.entries.every(entry => entry.expectedMinor !== null))
  const entries = rows.flatMap(row => row.entries)
  const provisional = entries.some(entry => entry.open)
  const totalMinor = complete ? entries.reduce((sum, entry) => sum + (entry.expectedMinor ?? 0), 0) : null
  return { from, to, rows, totalMinor, provisional, unclassifiedCount }
}
