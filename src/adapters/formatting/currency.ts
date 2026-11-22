const formatters = new Map<string, Intl.NumberFormat>()

/** Cache the small set of presentation configurations used by the application. */
export function formatInr(value: number, locale = 'en-IN', decimals = 2): string {
  const key = `${locale}:${decimals}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    formatters.set(key, formatter)
  }
  return formatter.format(value === 0 ? 0 : value)
}
