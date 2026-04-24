import { describe, it, expect } from 'vitest'
import { runCommand } from '../command'

// runCommand rejects unsafe executable names before spawning, as a
// defense-in-depth layer complementing shell: false. We verify the
// rejection by asserting the promise rejects — actual process
// execution happens further down and is not exercised here.

describe('runCommand (safe-command-name assertion)', () => {
  it('rejects command names containing shell metacharacters', async () => {
    await expect(runCommand('echo; rm -rf /', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('echo | nc evil 80', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('ls && curl evil', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('`whoami`', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('$(pwd)', [])).rejects.toThrow(/unsafe command name/)
  })

  it('rejects command names with null bytes', async () => {
    await expect(runCommand('echo\0rm', [])).rejects.toThrow(/unsafe command name/)
  })

  it('rejects command names with whitespace', async () => {
    await expect(runCommand('echo foo', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('\tls', [])).rejects.toThrow(/unsafe command name/)
    await expect(runCommand('ls\n', [])).rejects.toThrow(/unsafe command name/)
  })

  it('rejects non-string command inputs', async () => {
    // @ts-expect-error testing defensive input handling
    await expect(runCommand(null, [])).rejects.toThrow(/unsafe command name/)
    // @ts-expect-error testing defensive input handling
    await expect(runCommand(undefined, [])).rejects.toThrow(/unsafe command name/)
  })

  it('accepts a bare executable name', async () => {
    // This promise will reject because `does-not-exist` isn't installed,
    // but the rejection will come from spawn (ENOENT), not the safety
    // check — the error message must NOT contain "unsafe command name".
    try {
      await runCommand('does-not-exist', [])
    } catch (err) {
      expect(String(err)).not.toMatch(/unsafe command name/)
    }
  })

  it('accepts an absolute path executable name', async () => {
    try {
      await runCommand('/usr/bin/does-not-exist', [])
    } catch (err) {
      expect(String(err)).not.toMatch(/unsafe command name/)
    }
  })
})
