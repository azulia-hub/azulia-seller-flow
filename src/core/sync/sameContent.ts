/** Compare JSON source values without treating object-key order as a record change.
 * Array order and every unknown field remain significant. Inputs must be acyclic JSON.
 */
export function sameContent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameContent(value, right[index]))
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && sameContent(a[key], b[key]))
}
