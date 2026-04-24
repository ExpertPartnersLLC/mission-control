import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Mock the logger so we can silently assert on warnings without noise.
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock the database dependency — indexFile's db operations are black-boxed
// behind the Database type; we just record what it would have done.
vi.mock('@/lib/db', () => ({
  getDatabase: () => makeMockDb(),
}))

type MockDb = {
  exec: ReturnType<typeof vi.fn>
  prepare: ReturnType<typeof vi.fn>
  transaction: (fn: () => void) => () => void
}

function makeMockDb(): MockDb {
  const prepared = { run: vi.fn(), get: vi.fn(), all: vi.fn() }
  return {
    exec: vi.fn(),
    prepare: vi.fn(() => prepared),
    transaction: (fn: () => void) => () => fn(),
  }
}

import { indexFile } from '../memory-search'

describe('indexFile (path-injection defense-in-depth)', () => {
  let baseDir: string
  let mockDb: MockDb

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'mc-indexfile-test-'))
    mockDb = makeMockDb()
  })

  afterEach(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best effort
    }
  })

  it('indexes a file whose relative path resolves inside baseDir', () => {
    // Create a real file inside baseDir.
    mkdirSync(path.join(baseDir, 'notes'), { recursive: true })
    writeFileSync(path.join(baseDir, 'notes', 'hello.md'), '# Hello\nbody text\n')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexFile(mockDb as any, baseDir, 'notes/hello.md')

    // Should have prepared DELETE and INSERT statements.
    const calls = mockDb.prepare.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => /INSERT INTO memory_fts/.test(c))).toBe(true)
  })

  it('refuses to index a path that escapes baseDir with traversal segments', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexFile(mockDb as any, baseDir, '../../../etc/passwd')

    // exec is allowed (it runs ensureFtsTable), but prepare MUST NOT be
    // called — that's the signal that we short-circuited before any
    // filesystem or database mutation.
    expect(mockDb.prepare).not.toHaveBeenCalled()
  })

  it('refuses to index an absolute path that escapes baseDir', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexFile(mockDb as any, baseDir, '/etc/passwd')

    expect(mockDb.prepare).not.toHaveBeenCalled()
  })

  it('refuses to index a path mixing traversal and legit segments', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexFile(mockDb as any, baseDir, 'notes/../../../../etc/passwd')

    expect(mockDb.prepare).not.toHaveBeenCalled()
  })
})
