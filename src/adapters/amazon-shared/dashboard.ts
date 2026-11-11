import type { buildBusinessOverview } from '../../core/analytics/businessOverview'
import type { PulseScoreboard } from '../../core/analytics/pulseScoreboard'
export interface SharedDashboard {
  revision:number; settingsVersion:number; engine:string; calculatedAt:string
  business:ReturnType<typeof buildBusinessOverview>; pulse:PulseScoreboard
}
