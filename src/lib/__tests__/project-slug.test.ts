import { describe, it, expect } from 'vitest'
import { slugify, normalizePrefix } from '../project-slug'

describe('slugify', () => {
  it('produces a lowercase, kebab-case slug', () => {
    expect(slugify('My Project')).toBe('my-project')
  })

  it('strips leading and trailing dashes', () => {
    expect(slugify('--foo--')).toBe('foo')
  })

  it('collapses runs of non-alphanumeric characters into one dash', () => {
    expect(slugify('a!!b@@c')).toBe('a-b-c')
  })

  it('truncates at 64 characters', () => {
    const long = 'a'.repeat(200)
    expect(slugify(long).length).toBeLessThanOrEqual(64)
  })
})

describe('slugify (ReDoS hardening)', () => {
  it('returns quickly on a 10MB dash-heavy pathological input', () => {
    // The /^-+|-+$/g pattern is polynomial on many leading/trailing dashes.
    // Without the length cap, this input would run the regex over 10 MB.
    const pathological = '-'.repeat(10_000_000) + 'name' + '-'.repeat(10_000_000)
    const start = Date.now()
    const result = slugify(pathological)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(result.length).toBeLessThanOrEqual(64)
  })

  it('returns quickly on 10MB of alternating non-alphanumerics', () => {
    const pathological = '!@#'.repeat(3_000_000)
    const start = Date.now()
    const result = slugify(pathological)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(result).toBe('')
  })

  it('accepts null and undefined defensively', () => {
    // @ts-expect-error testing defensive input handling
    expect(slugify(null)).toBe('')
    // @ts-expect-error testing defensive input handling
    expect(slugify(undefined)).toBe('')
  })
})

describe('normalizePrefix', () => {
  it('uppercases and strips non-alphanumerics', () => {
    expect(normalizePrefix('my-prj!')).toBe('MYPRJ')
  })

  it('truncates at 12 characters', () => {
    expect(normalizePrefix('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL')
  })

  it('returns quickly on a huge input', () => {
    const pathological = 'a'.repeat(10_000_000)
    const start = Date.now()
    const result = normalizePrefix(pathological)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(result.length).toBeLessThanOrEqual(12)
  })
})
