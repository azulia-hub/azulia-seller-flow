import type { ClassificationRule } from '../../core/classification/types'

const storageKey = 'sellerflow.classification-rules.v1'
const eventKinds = new Set(['SALE','REFUND','FEE','REIMBURSEMENT','TAX','SETTLEMENT','OTHER','UNKNOWN'])
const amountClasses = new Set(['OPERATING','SETTLEMENT'])

export function loadClassificationRules(): ClassificationRule[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ClassificationRule => Boolean(item && typeof item.id === 'string' && typeof item.source === 'string' && typeof item.rawType === 'string' && eventKinds.has(item.event) && amountClasses.has(item.amountClass) && typeof item.createdAt === 'string'))
  } catch { return [] }
}

export function saveClassificationRules(rules: readonly ClassificationRule[]) {
  localStorage.setItem(storageKey, JSON.stringify(rules))
}
