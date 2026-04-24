import { describe, test, expect } from 'vitest'
import {
  extractWikiLinks,
  extractSchema,
  validateSchema,
} from '../memory-utils'

describe('extractWikiLinks', () => {
  test('extracts basic wiki-links', () => {
    const content = 'See [[my-note]] for details.'
    const links = extractWikiLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({ target: 'my-note', display: 'my-note', line: 1 })
  })

  test('extracts wiki-links with display text (alias)', () => {
    const content = 'Check [[my-note|My Custom Label]].'
    const links = extractWikiLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({ target: 'my-note', display: 'My Custom Label', line: 1 })
  })

  test('extracts multiple links on same line', () => {
    const content = '[[foo]] and [[bar]] are related.'
    const links = extractWikiLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0].target).toBe('foo')
    expect(links[1].target).toBe('bar')
  })

  test('extracts links across multiple lines', () => {
    const content = 'Line 1 has [[alpha]]\nLine 2 is plain\nLine 3 has [[beta]]'
    const links = extractWikiLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ target: 'alpha', display: 'alpha', line: 1 })
    expect(links[1]).toEqual({ target: 'beta', display: 'beta', line: 3 })
  })

  test('returns empty for no links', () => {
    expect(extractWikiLinks('No links here.')).toEqual([])
  })

  test('trims whitespace in targets', () => {
    const links = extractWikiLinks('See [[ spaced-note ]].')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('spaced-note')
  })
})

describe('extractSchema', () => {
  test('returns null for no frontmatter', () => {
    expect(extractSchema('# Just a heading')).toBeNull()
  })

  test('returns null for frontmatter without _schema', () => {
    const content = '---\ntitle: My Note\n---\nBody text'
    expect(extractSchema(content)).toBeNull()
  })

  test('extracts type from _schema block', () => {
    const content = '---\n_schema:\n  type: note\n---\nBody'
    const schema = extractSchema(content)
    expect(schema).not.toBeNull()
    expect(schema!.type).toBe('note')
  })

  test('extracts required fields', () => {
    const content = '---\n_schema:\n  type: note\n  required: [title, tags]\n---\n'
    const schema = extractSchema(content)
    expect(schema!.required).toEqual(['title', 'tags'])
  })

  test('extracts optional fields', () => {
    const content = '---\n_schema:\n  type: note\n  optional: [source, author]\n---\n'
    const schema = extractSchema(content)
    expect(schema!.optional).toEqual(['source', 'author'])
  })
})

describe('validateSchema', () => {
  test('valid when no schema present', () => {
    const result = validateSchema('# No schema\nBody text')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.schema).toBeNull()
  })

  test('valid when all required fields present', () => {
    const content = '---\ntitle: Hello\ntags: [a, b]\n_schema:\n  type: note\n  required: [title, tags]\n---\n'
    const result = validateSchema(content)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test('invalid when required fields missing', () => {
    const content = '---\ntitle: Hello\n_schema:\n  type: note\n  required: [title, tags]\n---\n'
    const result = validateSchema(content)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: tags')
  })

  test('reports all missing fields', () => {
    const content = '---\n_schema:\n  type: note\n  required: [title, tags, source]\n---\n'
    const result = validateSchema(content)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(3)
  })
})

describe('extractSchema (ReDoS hardening)', () => {
  test('returns quickly on a 10MB pathological required: block', () => {
    // Craft a frontmatter with a malformed required:[ that never closes and
    // is padded with backslashes — the shape flagged by CodeQL for the
    // [^\]]* regex.
    const huge = '---\n_schema:\n  required:[' + '\\'.repeat(10_000_000) + '\n---\n'
    const start = Date.now()
    const schema = extractSchema(huge)
    const elapsed = Date.now() - start
    // The schema MAY return null (no closing `]` was found) — correctness
    // is that the call returns fast, not polynomial-blowup slow.
    expect(elapsed).toBeLessThan(200)
    // And it must not throw.
    expect(schema === null || typeof schema === 'object').toBe(true)
  })

  test('returns quickly on a 10MB pathological optional: block', () => {
    const huge = '---\n_schema:\n  optional:[' + '\\'.repeat(10_000_000) + '\n---\n'
    const start = Date.now()
    const schema = extractSchema(huge)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)
    expect(schema === null || typeof schema === 'object').toBe(true)
  })

  test('handles non-string input defensively', () => {
    // @ts-expect-error testing input validation
    expect(extractSchema(null)).toBeNull()
    // @ts-expect-error testing input validation
    expect(extractSchema(undefined)).toBeNull()
    // @ts-expect-error testing input validation
    expect(extractSchema(42)).toBeNull()
  })

  test('still parses legitimate frontmatter of normal size', () => {
    const content = '---\n_schema:\n  type: note\n  required: [title, tags]\n  optional: [source]\n---\nbody\n'
    const schema = extractSchema(content)
    expect(schema).not.toBeNull()
    expect(schema!.type).toBe('note')
    expect(schema!.required).toEqual(['title', 'tags'])
    expect(schema!.optional).toEqual(['source'])
  })
})
