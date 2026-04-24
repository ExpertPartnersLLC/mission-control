import { describe, it, expect } from 'vitest'
import { getAdapter, listAdapters } from '../adapters'

describe('getAdapter (own-property lookup)', () => {
  it('returns an adapter for each listed framework', () => {
    for (const name of listAdapters()) {
      expect(() => getAdapter(name)).not.toThrow()
    }
  })

  it('throws for an unknown framework', () => {
    expect(() => getAdapter('not-a-framework')).toThrow(/Unknown framework adapter/)
  })

  it('throws for inherited Object prototype keys (no descent)', () => {
    // Without the hasOwnProperty guard, `adapters.toString` would be the
    // inherited Function, `if (!factory)` would pass, and the function
    // would be invoked. The guard rejects these lookups.
    expect(() => getAdapter('toString')).toThrow(/Unknown framework adapter/)
    expect(() => getAdapter('constructor')).toThrow(/Unknown framework adapter/)
    expect(() => getAdapter('hasOwnProperty')).toThrow(/Unknown framework adapter/)
    expect(() => getAdapter('__proto__')).toThrow(/Unknown framework adapter/)
  })
})
