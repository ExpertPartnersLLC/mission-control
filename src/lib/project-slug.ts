// Slug + ticket-prefix normalization for project creation.
// Extracted from src/app/api/projects/route.ts so the ReDoS-hardening
// bounds can be unit-tested in isolation.
//
// The final outputs are always short (slug <=64, prefix <=12), but those
// caps are applied AFTER the regex chain runs. An unbounded input would
// run the /^-+|-+$/g pattern over the full string, which has polynomial
// backtracking behavior on crafted dash-heavy inputs. The MAX_*_INPUT
// constants bound the regex domain before any quantifier can blow up.

export const MAX_PROJECT_NAME_INPUT_LENGTH = 256
export const MAX_PREFIX_INPUT_LENGTH = 64

export function slugify(input: string): string {
  const raw = String(input || '')
  const bounded = raw.length > MAX_PROJECT_NAME_INPUT_LENGTH
    ? raw.slice(0, MAX_PROJECT_NAME_INPUT_LENGTH)
    : raw
  return bounded
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function normalizePrefix(input: string): string {
  const raw = String(input || '')
  const bounded = raw.length > MAX_PREFIX_INPUT_LENGTH
    ? raw.slice(0, MAX_PREFIX_INPUT_LENGTH)
    : raw
  const normalized = bounded.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.slice(0, 12)
}
