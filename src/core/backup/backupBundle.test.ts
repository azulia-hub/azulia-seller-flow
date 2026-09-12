import { describe, expect, it } from 'vitest'
import { buildBackupBundle, parseBackupBundle } from './backupBundle'

describe('backup bundle', () => {
  it('round trips a versioned empty bundle', () => {
    const bundle = buildBackupBundle({ imports: [], costs: [], classificationRules: [] }, '2026-09-12T00:00:00.000Z')
    expect(parseBackupBundle(JSON.stringify(bundle))).toEqual(bundle)
  })
  it('rejects unsupported and malformed backups', () => {
    expect(() => parseBackupBundle('{')).toThrow('valid SellerFlow')
    expect(() => parseBackupBundle(JSON.stringify({ product: 'SellerFlow', version: 2, imports: [], costs: [], classificationRules: [] }))).toThrow('not supported')
  })
})
