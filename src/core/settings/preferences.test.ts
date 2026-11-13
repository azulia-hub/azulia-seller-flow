import { it, expect } from 'vitest'
import { preferences, defaultPreferences } from './preferences'
it('migrates missing preferences and bounds sync to the supported interval', () => {
  expect(preferences(null)).toEqual(defaultPreferences)
  expect(preferences({ syncMinutes: 0, metrics: [], periods: [], theme: 'invalid' })).toEqual(defaultPreferences)
  expect(preferences({ syncMinutes: 5, wifiOnly: true, periods: ['Yesterday','Yesterday','bogus'], metrics: ['netEarnings'] })).toMatchObject({ syncMinutes: 5, wifiOnly: true, periods: ['Yesterday'], metrics: ['netEarnings'] })
})
it('keeps unknown future preferences and does not coerce invalid boolean strings', () => {
  expect(preferences({ futureOption: 'preserved', wifiOnly: 'false' })).toMatchObject({ futureOption: 'preserved', wifiOnly: false })
})
