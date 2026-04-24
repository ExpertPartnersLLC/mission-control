import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

// The provisioner is CJS and sits in ops/ outside the TS path alias.
// Load it via the native module's createRequire to keep this test
// portable across vitest's bundler.
const require_ = createRequire(import.meta.url)
const utilsPath = path.resolve(__dirname, '../../../ops/provisioner-utils.cjs')
const {
  clampTimeout,
  MAX_PROVISIONER_TIMEOUT_MS,
  MIN_PROVISIONER_TIMEOUT_MS,
  DEFAULT_PROVISIONER_TIMEOUT_MS,
} = require_(utilsPath) as typeof import('../../../ops/provisioner-utils.cjs')

describe('clampTimeout (js/resource-exhaustion fix)', () => {
  it('returns the default when value is falsy', () => {
    expect(clampTimeout(undefined)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(null)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(0)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout('')).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
  })

  it('enforces a 1-second floor', () => {
    expect(clampTimeout(1)).toBe(MIN_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(500)).toBe(MIN_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(999)).toBe(MIN_PROVISIONER_TIMEOUT_MS)
  })

  it('enforces a 10-minute ceiling', () => {
    expect(clampTimeout(60 * 60 * 1000)).toBe(MAX_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(Number.MAX_SAFE_INTEGER)).toBe(MAX_PROVISIONER_TIMEOUT_MS)
    // The original SSRF vector: attacker sends 2**53
    expect(clampTimeout(2 ** 53)).toBe(MAX_PROVISIONER_TIMEOUT_MS)
  })

  it('passes through values inside the allowed band', () => {
    expect(clampTimeout(5000)).toBe(5000)
    expect(clampTimeout(30_000)).toBe(30_000)
    expect(clampTimeout(MAX_PROVISIONER_TIMEOUT_MS)).toBe(MAX_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(MIN_PROVISIONER_TIMEOUT_MS)).toBe(MIN_PROVISIONER_TIMEOUT_MS)
  })

  it('rejects non-finite numbers by returning the default', () => {
    // Non-finite inputs (NaN, ±Infinity) fall through the Number.isFinite
    // guard and return the conservative default. This is the safer choice
    // for a supervisory timer — an unusual numeric input should get the
    // standard supervisory window, not the 10-minute ceiling.
    expect(clampTimeout(NaN)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(Infinity)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout(-Infinity)).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
    expect(clampTimeout('not-a-number')).toBe(DEFAULT_PROVISIONER_TIMEOUT_MS)
  })

  it('accepts numeric strings', () => {
    expect(clampTimeout('5000')).toBe(5000)
    expect(clampTimeout('100')).toBe(MIN_PROVISIONER_TIMEOUT_MS)
  })
})
