/** Human-readable labels for canonical return identifiers. Raw evidence stays intact. */
export function returnTypeLabel(value: string | null | undefined) {
  if (value === 'CUSTOMER_RETURN') return 'Customer return'
  if (value === 'RTO') return 'Return to origin (RTO)'
  if (value === 'UNKNOWN') return 'Return type unknown'
  return value ?? 'Not returned'
}
