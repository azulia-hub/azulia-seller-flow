import type { AdvertisingEntityRow, SearchTermQuery } from './contract'
import { sortPerformanceRows } from './sortPerformanceRows'

const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const hasDigit = /\p{N}/u
const isIdentifier = (token: string) => /^b[a-z0-9]{9}$/.test(token) || /^\p{N}+$/u.test(token) || (token.length === 10 && hasDigit.test(token))

function oneEdit(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false
  if (left.length > right.length) return oneEdit(right, left)
  let index = 0
  while (index < left.length && left[index] === right[index]) index++
  if (left.length < right.length) return left.slice(index) === right.slice(index + 1)
  if (left.slice(index + 1) === right.slice(index + 1)) return true
  return left[index] === right[index + 1] && left[index + 1] === right[index] &&
    left.slice(index + 2) === right.slice(index + 2)
}

export function selectSearchTermRows(rows: readonly AdvertisingEntityRow[], query: SearchTermQuery) {
  const tokens = words(query.search)
  if (!tokens.length) return sortPerformanceRows(rows, query)

  const exact: AdvertisingEntityRow[] = [], fuzzy: AdvertisingEntityRow[] = []
  const field = query.searchTermField ?? 'ALL'
  for (const row of rows) {
    const candidates = words(field === 'CUSTOMER' ? row.name :
      field === 'TARGET' ? row.target ?? '' : [row.name, row.target, row.subtitle].filter(Boolean).join(' '))
    const literal = (token: string) => candidates.some(candidate => {
      if (isIdentifier(token)) return candidate === token
      return candidate.includes(token)
    })
    let fuzzyMatch = false
    const matches = tokens.every(token => {
      if (literal(token)) return true
      if (token.length < 4 || hasDigit.test(token) || isIdentifier(token)) return false
      fuzzyMatch = candidates.some(candidate => !hasDigit.test(candidate) && !isIdentifier(candidate) && oneEdit(token, candidate))
      return fuzzyMatch
    })
    if (matches) (fuzzyMatch ? fuzzy : exact).push(row)
  }
  return query.sortSelected
    ? sortPerformanceRows([...exact, ...fuzzy], query)
    : [...sortPerformanceRows(exact, query), ...sortPerformanceRows(fuzzy, query)]
}
