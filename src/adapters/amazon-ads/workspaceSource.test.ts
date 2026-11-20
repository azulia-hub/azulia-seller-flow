import { expect, it } from 'vitest'
import { resolveAdvertisingSkus } from './workspaceSource'

it('resolves only exact or unambiguous financial SKU aliases without merging ambiguous identities', () => {
  const normalize = (value: string) => value.replace(/-MFN$/, '')
  const result = resolveAdvertisingSkus(['white-MFN', 'walnut', 'black', 'unknown'], ['white', 'walnut', 'walnut-MFN', 'black-MFN', 'black'], normalize)
  expect([...result]).toEqual([['white-MFN', 'white'], ['walnut', 'walnut'], ['black', 'black']])
  expect(resolveAdvertisingSkus(['WHITE'], ['WHITE-1', 'WHITE-2'], () => 'same').has('WHITE')).toBe(false)
})
