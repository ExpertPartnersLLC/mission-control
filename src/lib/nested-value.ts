// Dot-notation nested-object mutator with prototype-pollution protection.
// Extracted from src/app/api/gateway-config/route.ts so the guards can
// be unit-tested in isolation.

// Any of these keys, if used as a segment of a dot-path, would mutate
// the object's prototype chain rather than a normal property — the
// prototype-pollution attack surface CodeQL flags for setNestedValue.
export const UNSAFE_NESTED_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
])

export function hasUnsafeSegment(dotPath: string): boolean {
  for (const segment of dotPath.split('.')) {
    if (UNSAFE_NESTED_KEYS.has(segment)) return true
  }
  return false
}

/**
 * Set a value in a nested object using dot-notation path.
 *
 * Throws synchronously if any path segment is `__proto__`, `prototype`,
 * or `constructor`. Traverses only own properties — never descends into
 * inherited properties like `toString` or `hasOwnProperty`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  for (const key of keys) {
    if (UNSAFE_NESTED_KEYS.has(key)) {
      throw new Error(`setNestedValue: refusing unsafe key "${key}" in path "${path}"`)
    }
  }
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === undefined) {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}
