import { expect, it } from 'vitest'
import { nextAdvertisingGroups } from './groups'

it('persists versioned group membership without losing the previous comparison definition', () => {
  const initial = nextAdvertisingGroups({ schema: 1, groups: [], history: [] }, { name: 'Bedside variants', productIds: ['white', 'white', 'walnut'] }, 'g')
  expect(initial.groups[0].productIds).toEqual(['white', 'walnut'])
  const updated = nextAdvertisingGroups(initial, { id: 'g', name: 'Bedside variants', productIds: ['white', 'walnut', 'black'] }, 'unused')
  expect(updated.groups[0].version).toBe(2)
  expect(updated.history).toEqual([initial.groups[0]])
  expect(initial.groups[0].version).toBe(1)
  expect(() => nextAdvertisingGroups(initial, { id: 'missing', name: 'Name', productIds: ['white'] }, 'unused')).toThrow('no longer exists')
})
