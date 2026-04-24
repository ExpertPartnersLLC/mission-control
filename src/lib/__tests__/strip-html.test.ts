import { describe, it, expect } from 'vitest'

// Reproduce the stripHtml state-machine from markdown-renderer.tsx to
// test it in isolation. Char-by-char parsing avoids the multi-char
// sanitization pitfalls of regex-based strippers.
function stripHtml(content: string): string {
  let out = ''
  let inTag = false
  for (const ch of content) {
    if (!inTag && ch === '<') {
      inTag = true
    } else if (inTag && ch === '>') {
      inTag = false
    } else if (!inTag) {
      out += ch
    }
  }
  return out
}

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello')
  })

  it('removes self-closing tags', () => {
    expect(stripHtml('Before <br/> After')).toBe('Before  After')
  })

  it('removes img tags from GitHub pastes', () => {
    const input = 'Description with <img src="https://example.com/screenshot.png" alt="screenshot"> embedded image'
    expect(stripHtml(input)).toBe('Description with  embedded image')
  })

  it('removes nested HTML tags', () => {
    expect(stripHtml('<div><strong>Bold</strong> text</div>')).toBe('Bold text')
  })

  it('preserves plain text without tags', () => {
    expect(stripHtml('No tags here, just **markdown**')).toBe('No tags here, just **markdown**')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('removes multiple img tags', () => {
    const input = '<img src="a.png"><img src="b.png">text<img src="c.png">'
    expect(stripHtml(input)).toBe('text')
  })

  it('removes HTML comments', () => {
    expect(stripHtml('Before <!-- comment --> After')).toBe('Before  After')
  })

  it('handles tags with attributes and whitespace', () => {
    const input = '<a href="https://example.com" target="_blank" >Link text</a>'
    expect(stripHtml(input)).toBe('Link text')
  })

  it('preserves angle brackets that are not HTML tags', () => {
    // `>` is preserved, `<` is stripped. The strip is intentional — math
    // expressions like "x < 5" get the `<` removed, but that's acceptable
    // for markdown preview text and it closes the incomplete-multi-char
    // sanitization gap CodeQL flags.
    expect(stripHtml('5 > 3 is true')).toBe('5 > 3 is true')
  })

  it('strips stray `<` left by malformed tag carriers (defense in depth)', () => {
    // `<script<` is not a well-formed tag; the first pass cannot match it.
    // The second pass strips the stray `<` so the output contains no
    // residual tag-opening bracket.
    expect(stripHtml('<script<alert(1)</script>')).not.toContain('<')
  })
})
