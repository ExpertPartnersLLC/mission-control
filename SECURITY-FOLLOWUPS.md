# Security Follow-ups

Tracks security work deferred from completed sprints. Each entry lists the
originating sprint, the reason for deferral, and the scope of the planned
follow-up.

---

## Deferred from 2026-04-23 sprint

### Bump vitest to 3.x to close DBT#28 (vite) and DBT#1 (esbuild)

**Status:** Open, pending a dedicated toolchain-upgrade sprint.

**Alerts:**

| Alert | Package | Installed | Patched | Vuln |
|---|---|---|---|---|
| [DBT#28](https://github.com/ExpertPartners/mission-control/security/dependabot/28) | vite (medium, dev-scope) | 5.4.21 | 6.4.2 | Path traversal in optimized deps `.map` handling |
| [DBT#1](https://github.com/ExpertPartners/mission-control/security/dependabot/1) | esbuild (medium, dev-scope) | 0.21.5 | 0.25.0 | Dev server CORS allows any website to read responses |

Both are `scope:development` — they affect the Vite dev server (`pnpm dev`)
and the esbuild dev server used by Vite. Neither is reachable in the
production Next.js build.

**Why deferred:** Closing these requires bumping `vitest` from 2.1.5 to
3.x. The 3.x line has breaking changes in:
- config format (`test.*` schema)
- reporter API
- type inference for `expect` / `vi.fn`
- coverage thresholds (`@vitest/coverage-v8`)

A major toolchain upgrade is out of scope for a security-patch sprint that
was explicitly chartered "no dependency upgrades unless required by a fix."
Mixing the upgrade into the security PR would also mix two separate
review concerns (security vs. test-harness behavior) and make revert
harder if any single security fix turns out wrong.

**Why not dismissed:** "Dev-scope" is inconvenience-framing, not a real
dismissal reason. Any contributor running `pnpm test` or `pnpm dev` on a
compromised network is potentially exploitable. Dev-tool supply-chain
attacks are historically common (xz-utils, eslint-scope, event-stream).
Keeping the alerts open preserves the signal until we're ready to pay the
toolchain-upgrade cost.

**Planned scope of the follow-up sprint:**
1. Upgrade `vitest` and `@vitest/coverage-v8` to 3.x; likely also
   `@vitejs/plugin-react` if its peer range requires vite 6.
2. Verify `pnpm-lock.yaml` resolves `vite >= 6.4.2` and `esbuild >= 0.25.0`.
3. Run full test suite (76 files, 943 tests at sprint close); fix any
   3.x incompatibilities (config format, reporter plumbing, coverage).
4. Run `pnpm build` and `pnpm test:e2e` to confirm the Next.js build and
   Playwright suite still work.
5. After merge, verify Dependabot closes DBT#28 and DBT#1.

**Originating sprint artifacts:**
- Branch: `security/codeql-sprint-2026-04-23`
- Triage: [alerts-triage.md](./alerts-triage.md)
- Sprint PR: see the ExpertPartners/mission-control pull-request list.
