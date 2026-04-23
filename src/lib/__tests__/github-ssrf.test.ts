import { describe, it, expect } from 'vitest'
import { buildGithubApiUrl } from '../github'

describe('buildGithubApiUrl (SSRF hardening)', () => {
  describe('accepts relative API paths', () => {
    it('accepts a path with leading slash', () => {
      expect(buildGithubApiUrl('/repos/owner/repo/issues')).toBe(
        'https://api.github.com/repos/owner/repo/issues',
      )
    })

    it('accepts a path without leading slash', () => {
      expect(buildGithubApiUrl('user')).toBe('https://api.github.com/user')
    })

    it('preserves query strings', () => {
      expect(buildGithubApiUrl('/repos/o/r/issues?state=open&per_page=30')).toBe(
        'https://api.github.com/repos/o/r/issues?state=open&per_page=30',
      )
    })

    it('accepts an explicit api.github.com absolute URL', () => {
      // This is technically allowed because the origin check passes, but only
      // after the scheme check rejects generic absolute URLs. Verifies the
      // rule is "host must match," not "must be relative" — except we DO
      // require relative. This input has a scheme, so it must be rejected.
      expect(() => buildGithubApiUrl('https://api.github.com/user')).toThrow(
        /absolute URLs are not permitted/,
      )
    })
  })

  describe('rejects SSRF-shaped inputs', () => {
    it('rejects an https URL to a different host', () => {
      expect(() => buildGithubApiUrl('https://evil.example.com/foo')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects an http URL', () => {
      expect(() => buildGithubApiUrl('http://internal.corp/api')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects a protocol-relative URL', () => {
      expect(() => buildGithubApiUrl('//evil.example.com/foo')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects a file: URL', () => {
      expect(() => buildGithubApiUrl('file:///etc/passwd')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects a javascript: URL', () => {
      expect(() => buildGithubApiUrl('javascript:alert(1)')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects a data: URL', () => {
      expect(() => buildGithubApiUrl('data:text/plain,foo')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects a custom scheme', () => {
      expect(() => buildGithubApiUrl('gopher://internal.corp/')).toThrow(
        /absolute URLs are not permitted/,
      )
    })
  })

  describe('input validation', () => {
    it('rejects empty input', () => {
      expect(() => buildGithubApiUrl('')).toThrow(/path is required/)
    })

    it('rejects whitespace-only input', () => {
      expect(() => buildGithubApiUrl('   ')).toThrow(/path is required/)
    })
  })

  describe('metadata service SSRF patterns', () => {
    it('rejects AWS IMDS via http scheme', () => {
      expect(() => buildGithubApiUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
        /absolute URLs are not permitted/,
      )
    })

    it('rejects GCP metadata via protocol-relative URL', () => {
      expect(() => buildGithubApiUrl('//metadata.google.internal/computeMetadata/v1/')).toThrow(
        /absolute URLs are not permitted/,
      )
    })
  })
})
