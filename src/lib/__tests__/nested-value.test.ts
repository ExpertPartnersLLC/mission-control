import { describe, it, expect, afterEach } from 'vitest'
import {
  setNestedValue,
  hasUnsafeSegment,
  UNSAFE_NESTED_KEYS,
} from '../nested-value'

describe('setNestedValue — basic behavior', () => {
  it('sets a shallow property', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'a', 1)
    expect(obj).toEqual({ a: 1 })
  })

  it('creates nested structure along the dot path', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'gateway.ports.http', 3000)
    expect(obj).toEqual({ gateway: { ports: { http: 3000 } } })
  })

  it('overwrites an existing leaf', () => {
    const obj = { gateway: { host: 'old' } }
    setNestedValue(obj, 'gateway.host', 'new')
    expect(obj.gateway.host).toBe('new')
  })

  it('preserves sibling properties', () => {
    const obj = { gateway: { host: 'h', ports: { http: 3000 } } }
    setNestedValue(obj, 'gateway.ports.https', 3443)
    expect(obj).toEqual({ gateway: { host: 'h', ports: { http: 3000, https: 3443 } } })
  })
})

describe('setNestedValue — prototype pollution blocklist', () => {
  afterEach(() => {
    // If any test somehow pollutes Object.prototype, clean up so it
    // doesn't leak across tests.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (Object.prototype as any).polluted
  })

  it('throws on __proto__ as a segment', () => {
    const obj = {}
    expect(() => setNestedValue(obj, '__proto__.polluted', 'x')).toThrow(
      /refusing unsafe key "__proto__"/,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((({} as any).polluted)).toBeUndefined()
  })

  it('throws on prototype as a segment', () => {
    const obj = {}
    expect(() => setNestedValue(obj, 'foo.prototype.bar', 'x')).toThrow(
      /refusing unsafe key "prototype"/,
    )
  })

  it('throws on constructor as a segment', () => {
    const obj = {}
    expect(() => setNestedValue(obj, 'constructor.prototype.polluted', 'x')).toThrow(
      /refusing unsafe key "constructor"/,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((({} as any).polluted)).toBeUndefined()
  })

  it('throws on __proto__ as the terminal segment', () => {
    const obj = {}
    expect(() => setNestedValue(obj, 'foo.__proto__', 'x')).toThrow(
      /refusing unsafe key "__proto__"/,
    )
  })

  it('exposes the blocklist as a frozen set (read-only intent)', () => {
    expect(UNSAFE_NESTED_KEYS.has('__proto__')).toBe(true)
    expect(UNSAFE_NESTED_KEYS.has('prototype')).toBe(true)
    expect(UNSAFE_NESTED_KEYS.has('constructor')).toBe(true)
    expect(UNSAFE_NESTED_KEYS.has('normal_key')).toBe(false)
  })
})

describe('setNestedValue — own-property traversal', () => {
  it('does not descend into inherited properties like toString', () => {
    const obj: Record<string, unknown> = {}
    // Without the hasOwnProperty guard, current.toString would be the
    // inherited function and current = current.toString would redirect
    // traversal in unexpected ways.
    setNestedValue(obj, 'toString.foo', 'bar')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((obj as any).toString.foo).toBe('bar')
    // The own-property path is a plain object, not the inherited function.
    expect(typeof obj.toString).toBe('object')
  })
})

describe('hasUnsafeSegment', () => {
  it('returns true for unsafe keys in any position', () => {
    expect(hasUnsafeSegment('__proto__')).toBe(true)
    expect(hasUnsafeSegment('a.__proto__.b')).toBe(true)
    expect(hasUnsafeSegment('a.b.constructor')).toBe(true)
    expect(hasUnsafeSegment('a.prototype')).toBe(true)
  })

  it('returns false for safe paths', () => {
    expect(hasUnsafeSegment('gateway.ports.http')).toBe(false)
    expect(hasUnsafeSegment('a')).toBe(false)
    expect(hasUnsafeSegment('')).toBe(false)
    expect(hasUnsafeSegment('proto')).toBe(false) // substring but not exact match
  })
})
