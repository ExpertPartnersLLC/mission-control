# Security Alerts Triage — 2026-04-23

Branch: `security/codeql-sprint-2026-04-23`
Sprint scope: **28 CodeQL alerts + 30 Dependabot alerts = 58 total**
Categorization per alert: **Critical-real / Critical-theoretical / High-real / High-noise** (plus Medium for the 1 medium alert).

---

## Part 1 — CodeQL (28 open alerts)

### 1.1 Category roll-up

| Category | Count | Action in Phase 2 |
|---|---|---|
| Critical-real | 1 | Fix + test |
| Critical-theoretical | 2 | Defense-in-depth hardening + dismiss the CodeQL alert |
| High-real | 10 | Fix + test |
| High-theoretical / noise | 14 | Dismiss with specific justification (Phase 3) |
| Medium-real | 1 | Fix + test |
| **Total to fix** | **12** |  |
| **Total to dismiss** | **16** |  |

Real-fix set contains **11 High + 1 Medium + 1 Critical = 13 commits** in Phase 2a (one per fix with exception: the three schedule-parser ReDoS alerts share one fix because they're the same function).

### 1.2 Per-alert triage

#### Critical

**Alert #7 — `js/request-forgery` — `src/lib/github.ts:65`** → **Critical-real**
Data flow: `githubFetch(path, options)` → `const url = path.startsWith('https://') ? path : 'https://api.github.com...'` → `fetch(url)`. The `https://` branch accepts any full URL, making the function a SSRF primitive if any caller ever passes user-controlled URLs. Today all 14 in-repo callers pass server-literal paths (`/repos/${repo}/...`, `/user`, `/user/repos?...`), so the foot-gun isn't currently exercised — but it exists. Any future refactor that naively forwards `Link:` pagination headers, cached next-page URLs, or a webhook-provided URL would immediately turn it into a real vulnerability.
**Fix**: remove the `https://` fast-path; enforce that `path` is always a relative API path, and allowlist host resolution to `api.github.com`. If future code genuinely needs to fetch from `raw.githubusercontent.com` or a non-default Enterprise instance, that gets a separate explicit function with its own allowlist.

**Alert #6 — `js/command-line-injection` — `src/lib/command.ts:24`** → **Critical-theoretical**
`spawn(command, args, { shell: false })`. `shell: false` disables shell interpolation — argv elements are passed directly to `execve`, not a shell. Even if `args` contained `;rm -rf /`, it would be a literal positional arg, not a second command. `command` comes from `config.openclawBin` / `config.clawdbotBin` which resolve to `process.env.OPENCLAW_BIN || 'openclaw'` at boot — users cannot influence env vars from the API. CodeQL doesn't model `shell: false` in its taint analysis.
**Fix plan**: dismissal with reasoning ("`shell: false` disables shell-metacharacter interpretation; `command` is env-resolved at boot and not user-reachable"). Additionally, as defense-in-depth, add an explicit assertion at `runCommand` entry that `command` is an absolute path or a bare executable name matching `/^[a-zA-Z0-9_\-\.\/]+$/` — catches accidental regressions if a future refactor lets a caller pass user input.

**Alert #5 — `js/command-line-injection` — `ops/mc-provisioner-daemon.js:155`** → **Critical-theoretical**
Same `spawn(command, args, { shell: false })` pattern. Additionally, this daemon has a strict per-command allowlist (`validateCommand`) that rejects any command not in `useradd|install|cp|chown|rm|userdel|true|systemctl` and validates every arg position. A user would have to (a) possess the shared `MC_PROVISIONER_TOKEN` and (b) fit their payload into the existing allowlist schema — at which point they're already authorized to run the exact commands the allowlist permits.
**Fix plan**: dismissal with reasoning. No code change needed; existing allowlist is the enterprise-grade control.

#### High-real (fix in Phase 2a)

**Alerts #26, #27, #28 — `js/polynomial-redos` — `src/lib/schedule-parser.ts:99, 114, 139`** → **High-real, one shared fix**
`parseNaturalSchedule(input: string)` runs several regexes with overlapping quantifiers on raw user input from the cron/schedule API. The three flagged regexes all use `(.+)` capture groups that can backtrack polynomially on pathological inputs (e.g. `'every\t0\tat\t\t\t\t…'`). Natural-language schedules are never longer than ~60 characters in legitimate use.
**Fix**: cap `input.length` to 256 at function entry, reject longer; additionally swap `(.+)` for bounded/atomic classes where natural. One commit covers all three alerts because they share the same entry point.

**Alerts #24, #25 — `js/polynomial-redos` — `src/lib/memory-utils.ts:78, 83`** → **High-real**
`extractSchema` matches `required:\s*\[([^\]]*)\]` and `optional:\s*\[([^\]]*)\]` against markdown frontmatter content. `scanMemoryFiles` caps file size at 1 MB — a 1 MB pathological frontmatter containing `required:[\\\\\\\\\\\\…` can force backtracking. Memory files are user-writable via the `POST /api/memory` route.
**Fix**: cap the frontmatter slice being regex-scanned (`content.slice(0, 64*1024)` is far more than any legit frontmatter); tighten the inner class to `[^\]\\]` and separately consume `\]` escapes if we ever need them (current code doesn't use them).

**Alert #23 — `js/polynomial-redos` — `src/app/api/projects/route.ts:9`** → **High-real**
`slugify(input)` runs `.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')` on the full user input. The cap `.slice(0, 64)` is applied AFTER the regex chain, so a 10 MB `name` field still runs the full regex chain on all of it. The second regex `/^-+|-+$/g` is the specific ReDoS candidate (leading/trailing dash matching).
**Fix**: cap `input` to 256 characters at the top of slugify (`String(input || '').slice(0, 256)`) BEFORE running regexes. 256 is 4× the final 64-char output cap — generous headroom for diacritics and Unicode that normalize down.

**Alert #22 — `js/resource-exhaustion` — `ops/mc-provisioner-daemon.js:163`** → **High-real**
`setTimeout(..., Math.max(1000, Number(timeoutMs || 10000)))` has a floor of 1 s but no ceiling. A client that supplies `timeoutMs: 2**53` holds the spawned child and the timer handle indefinitely.
**Fix**: clamp to `Math.min(600000, Math.max(1000, Number(timeoutMs || 10000)))` (10-minute ceiling). Reasonable for the allowlist commands (longest legitimate is `systemctl enable --now …` which completes in seconds).

**Alert #19 — `js/path-injection` — `src/lib/memory-search.ts:113`** → **High-real (defense-in-depth gap)**
`indexFile(db, baseDir, relativePath)` does `readFileSync(join(baseDir, relativePath))`. Current callers in `memory/route.ts` pass a `relativePath` that already went through `isPathAllowed` and `resolveSafeMemoryPath` upstream, so it's contained at the callsite. But `indexFile` itself has no internal guard — a new caller that forgot the upstream checks would re-open the vuln. Enterprise standard: validate at every boundary.
**Fix**: inside `indexFile`, call `resolveWithin(baseDir, relativePath)` before the `readFileSync`; same for `removeFromIndex` which already operates on path strings.

**Alert #20 — `js/prototype-pollution-utility` — `src/app/api/gateway-config/route.ts:281`** → **Medium-real** (only medium but real)
`setNestedValue(obj, path, value)` splits `path` on `.` and recursively assigns without blocking `__proto__`, `constructor`, or `prototype` keys. A PATCH to `/api/gateway-config` with `{ path: "__proto__.polluted", value: "x" }` pollutes `Object.prototype` — and the endpoint is authenticated `operator` role but operator is not admin, so privilege escalation is possible if a compromised operator token exists.
**Fix**: blocklist `__proto__`, `constructor`, `prototype` in `setNestedValue`; use `Object.create(null)` for fresh nested objects instead of `{}` when auto-creating; alternatively switch to a single `Object.defineProperty` write that refuses unsafe keys.

#### High-theoretical / noise (dismiss in Phase 3)

**Alert #1 — `js/insufficient-password-hash` — `src/lib/auth.ts:585-591`** → **High-noise**
`hashApiKey` and `hashSessionToken` call `createHash('sha256').update(rawKey).digest('hex')`. CodeQL's rule targets low-entropy user passwords where KDF iteration cost matters (bcrypt/argon2/scrypt). The inputs here are **not** passwords: `generateApiKey` and session tokens are produced by `randomBytes(32)` (256 bits of entropy, line 143). SHA-256 is the standard primitive for equality-check storage of high-entropy tokens — a KDF would add latency without raising the attacker's work factor. Real user passwords in this codebase use scrypt (line 243).
**Dismiss with reason** "won't fix" and the entropy justification.

**Alert #2 — `js/incomplete-multi-character-sanitization` — `src/components/markdown-renderer.tsx:12`** → **High-noise**
`stripHtml(content)` uses `<[^>]*>` to strip tags from the preview. CodeQL flags that malformed tags (`<script<`) could leak through. The stripped string is then passed to `<ReactMarkdown>` as the `children` prop — ReactMarkdown treats children as markdown AST input, not raw HTML, and its default renderer produces React elements (escaped by React). The output never hits `dangerouslySetInnerHTML`. Even a full `<script>alert(1)</script>` passed in would render as the literal text `alert(1)` (remark-gfm doesn't enable raw HTML by default in this component). Dismiss with specific reasoning; also **tighten** the stripper to use a more defensive approach as a one-line change (covered under defense-in-depth bucket).

**Alert #3 — same rule — `src/lib/__tests__/strip-html.test.ts:5`** → **High-noise**
Reproduces the `stripHtml` function locally to test it. Not a production sink. The test at line 51 (`'5 > 3 is true'`) explicitly documents the limitation. Dismiss with reason "used in tests".

**Alert #4 — `js/insecure-randomness` — `tests/helpers.ts:151`** → **High-noise**
`uid()` uses `Math.random()` to generate a suffix like `e2e-user-123456`. Used only in Playwright e2e test helpers (`createTestUser`, `createTestProject`) for collision avoidance on ephemeral test records. Not a security context. Dismiss with reason "used in tests".

**Alerts #8, #9 — `js/path-injection` — `src/app/api/agents/[id]/soul/route.ts:143, 144`** → **High-theoretical**
`templatePath = resolveWithin(config.soulTemplatesDir, ${template_name}.md)` — the user-controlled `template_name` is wrapped by `resolveWithin`, which throws on any path escape. CodeQL doesn't see the sanitizer's throw. Additionally, the existsSync/readFileSync on line 143-144 operate on the already-validated path. Dismiss with specific reasoning that resolveWithin is the containment boundary.
**However** — defense-in-depth: add explicit upfront rejection of `template_name` values containing `/`, `\`, `..`, or null bytes. One-line guard, covered in the defense-in-depth bucket below.

**Alerts #10-15 — `js/path-injection` — `src/app/api/memory/route.ts:228, 247, 254, 260, 301, 306`** → **High-theoretical** (×6)
All six sinks in memory/route.ts operate on `fullPath`, which is the output of `resolveSafeMemoryPath(MEMORY_PATH, path)`. That sanitizer: (a) checks `isPathAllowed` against `MEMORY_ALLOWED_PREFIXES`, (b) calls `resolveWithin` (lexical containment), (c) `lstat`s the target and rejects symlinks, (d) `realpath`s both the parent and (if it exists) the target and re-verifies containment against the realpath'd base. This is a correctly-layered enterprise-grade sanitizer. CodeQL flags the downstream `fs.*` calls because its taint analysis doesn't model `resolveSafeMemoryPath` as a sanitizer. Dismiss all six with the same specific reasoning (pointing at `resolveSafeMemoryPath` as the boundary).

**Alerts #16, #17, #18 — `js/path-injection` — `src/lib/memory-path.ts:40, 57, 61`** → **High-theoretical** (×3)
These three alerts are firing **inside** `resolveSafeMemoryPath` itself — the calls to `realpath(baseDir)`, `lstat(fullPath)`, and `realpath(fullPath)` that make the sanitizer work. The data flow is "user input → sanitizer internals". This is the sanitizer. Dismiss with reason pointing at the security role of these specific calls.

**Alert #21 — `js/unvalidated-dynamic-method-call` — `src/lib/adapters/index.ts:21`** → **High-noise**
`const factory = adapters[framework]; if (!factory) throw …; return factory()`. `adapters` is a hard-coded object literal with 6 known keys. The lookup can only succeed for one of those 6 entries — lookup of `toString` etc. would return a function but the explicit check at line 20 would accept it and call it. That is the theoretical surface. Dismiss with reasoning; additionally **harden** via `Object.prototype.hasOwnProperty.call(adapters, framework)` to reject any non-own-property lookup.

### 1.3 Defense-in-depth hardening bundle

Even though several alerts above are categorized as noise/theoretical, the following changes are small, cheap, and harden the codebase:
- `command.ts` — add assertion that `command` matches safe pattern (also documents the invariant).
- `adapters/index.ts` — use `Object.prototype.hasOwnProperty.call(adapters, framework)`.
- `soul/route.ts` — explicit `template_name` shape check (no `/`, no `\`, no `..`, no null bytes, no leading `.`).
- `markdown-renderer.tsx` — tighten `stripHtml` to reject broken-tag carriers (mainly for consistency; not a real XSS sink given the React-Markdown consumer).

These ride inside the Phase 2 commits where they're cheapest; not separate commits.

### 1.4 Fix commit plan (Phase 2a)

Ordered so later commits build on earlier invariants:

1. `security: block SSRF in githubFetch by removing https:// fast-path` → alert #7
2. `security: cap input length in parseNaturalSchedule to prevent ReDoS` → alerts #26, #27, #28
3. `security: cap frontmatter scan window in extractSchema to prevent ReDoS` → alerts #24, #25
4. `security: cap input length in slugify to prevent ReDoS` → alert #23
5. `security: clamp provisioner timeout to 10 min upper bound` → alert #22
6. `security: validate path containment inside memory-search.ts:indexFile` → alert #19
7. `security: block prototype pollution in setNestedValue` → alert #20
8. `security: harden defense-in-depth (command.ts, adapters, soul templates, strip-html)` → bundled

Every commit ships with a focused unit test that exercises the attack string.

---

## Part 2 — Dependabot (30 open alerts)

### 2.1 Summary

All 30 alerts have a `first_patched_version` reachable via a minor or patch bump within the current major. **No major bump required — stop condition not triggered.**

| Package | Alerts | Current vuln range | Patched version | Type |
|---|---|---|---|---|
| `next` | 6 | `>=16.0.0-beta.0, <16.2.3` | `16.2.3` | direct, minor bump within major 16 |
| `minimatch` | 6 | `<3.1.4` or `>=9.0.0 <9.0.7` | `3.1.4` / `9.0.7` | transitive, patch |
| `picomatch` | 4 | `<2.3.2` or `>=4.0.0 <4.0.4` | `2.3.2` / `4.0.4` | transitive, patch |
| `unhead` | 3 | `<2.1.13` | `2.1.13` | transitive, patch |
| `flatted` | 2 | `<3.4.2` | `3.4.2` | transitive, patch |
| `brace-expansion` | 2 | `<1.1.13` or `>=2.0.0 <2.0.3` | `1.1.13` / `2.0.3` | transitive, patch |
| `ajv` | 1 | `<6.14.0` | `6.14.0` | transitive, minor within 6.x |
| `defu` | 1 | `<=6.1.4` | `6.1.5` | transitive, patch |
| `esbuild` | 1 | `<=0.24.2` | `0.25.0` | transitive, minor bump (pre-1.0) |
| `next-intl` | 1 | `<4.9.1` | `4.9.1` | direct-ish, patch |
| `rollup` | 1 | `>=4.0.0 <4.59.0` | `4.59.0` | transitive, minor within 4.x |
| `vite` | 1 | `<=6.4.1` | `6.4.2` | transitive, patch |
| `yaml` | 1 | `<2.8.3` | `2.8.3` | transitive, patch |

### 2.2 Severity classification

All 30 Dependabot alerts → **High-real or Medium-real** per the advisory's security-severity. None triageable as noise — they're published CVEs with confirmed exploit paths.

### 2.3 Fix strategy (Phase 2b)

Two commits:

1. **`security: bump next to 16.2.3 for 6 GHSAs`**
   Covers alerts DBT#30 (Server Components DoS), #18 (image cache DoS), #16 (HTTP smuggling), #15 (postponed resume DoS), #14 (Server Actions null-origin CSRF), #13 (dev HMR null-origin CSRF). Direct dep, clean minor bump within 16.x. Run `pnpm up next@16.2.3`.

2. **`security: update transitive dependencies via pnpm overrides for 24 GHSAs`**
   Add `pnpm.overrides` entries in `package.json` pinning the transitive packages to their patched floors:
   ```json
   "pnpm": {
     "overrides": {
       "minimatch@<3.1.4": "^3.1.4",
       "minimatch@>=9.0.0 <9.0.7": "^9.0.7",
       "picomatch@<2.3.2": "^2.3.2",
       "picomatch@>=4.0.0 <4.0.4": "^4.0.4",
       "brace-expansion@<1.1.13": "^1.1.13",
       "brace-expansion@>=2.0.0 <2.0.3": "^2.0.3",
       "flatted@<3.4.2": "^3.4.2",
       "unhead@<2.1.13": "^2.1.13",
       "defu@<6.1.5": "^6.1.5",
       "yaml@<2.8.3": "^2.8.3",
       "ajv@<6.14.0": "^6.14.0",
       "esbuild@<0.25.0": "^0.25.0",
       "rollup@<4.59.0": "^4.59.0",
       "vite@<6.4.2": "^6.4.2",
       "next-intl@<4.9.1": "^4.9.1"
     }
   }
   ```
   Then `pnpm install` to regenerate `pnpm-lock.yaml`; run full test suite (`pnpm test:all`).
   If any override breaks the build (e.g. a breaking change slipped into a patch version), the stop condition "a dependency needs a major version bump" does not apply — but "fix breaks existing functionality and no clean resolution" does; pause and report.

### 2.4 Validation

After each commit: run `pnpm install` then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. After both commits: re-query Dependabot alerts and confirm each is marked `fixed` or `dismissed` by GitHub's auto-close logic.

---

## Part 3 — Upstream reporting plan (Phase 4)

All CodeQL alerts except #2 (`markdown-renderer.tsx`) exist in upstream `builderz-labs/mission-control` since the fork was lightly modified. Upstream notifications to draft:

1. **SSRF in `githubFetch`** (alert #7) — single-paragraph issue + patch diff.
2. **ReDoS triplet in `schedule-parser.ts`** (alerts #26-28) — one issue with three regex references.
3. **ReDoS in `memory-utils.ts` frontmatter parser** (alerts #24-25) — one issue.
4. **ReDoS in `projects/route.ts:slugify`** (alert #23) — one issue.
5. **Resource exhaustion in `mc-provisioner-daemon.js`** (alert #22) — one issue.
6. **Defense-in-depth gap in `memory-search.ts:indexFile`** (alert #19) — one issue.
7. **Prototype pollution in `gateway-config/route.ts:setNestedValue`** (alert #20) — one issue (this is the highest-impact upstream report).

Drafts go to `upstream-reports.md`; **nothing submitted upstream without explicit approval** per the launch prompt's single approval gate.

---

## Part 4 — What is NOT being changed

- No refactors, no lint cleanups, no dependency upgrades beyond what the alerts require.
- No changes to the auth flow, rate-limit plumbing, or session management beyond the `hashApiKey` dismissal documentation.
- No changes to `resolveSafeMemoryPath` or `resolveWithin` — they are the correct sanitizers; the fixes live at the **callers** that bypass them (only `memory-search.ts:indexFile`).
- No changes to the preview pipeline in `markdown-renderer.tsx` beyond tightening `stripHtml`. The XSS risk is already blocked by React-Markdown's default-safe rendering; we keep a small hardening but don't rearchitect.

---

**End of Phase 1 triage.** Proceeding to Phase 2a.
