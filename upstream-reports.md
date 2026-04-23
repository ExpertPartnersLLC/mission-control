# Upstream Security Reports — `builderz-labs/mission-control`

Drafts prepared for the 2026-04-23 security sprint. Each entry below is a
ready-to-paste GitHub issue body (or security advisory draft, depending
on coordinated-disclosure preference) for the upstream repo.

**DO NOT SUBMIT** until explicit approval per the sprint launch prompt.

Reporter: Allison Gaddy (fork maintainer, `ExpertPartnersLLC/mission-control`).
All reports below were discovered via GitHub CodeQL code-scanning in the fork.
Reference patches live on branch `security/codeql-sprint-2026-04-23` in the fork.

---

## Report 1 — Critical — SSRF via `githubFetch` `https://` bypass

**Suggested title:** `Security: SSRF in githubFetch via https:// fast-path accepting arbitrary hosts`

**Severity:** Critical (`js/request-forgery`, CWE-918)

**Location:** `src/lib/github.ts`, lines 46-48 (`githubFetch` function)

**Vulnerability.** `githubFetch(path, options)` currently constructs its URL
as:

```ts
const url = path.startsWith('https://')
  ? path
  : `https://api.github.com${path.startsWith('/') ? '' : '/'}${path}`
```

The `https://` fast-path means any caller that passes a full URL as `path`
causes the server to fetch that URL using the server's GitHub token as
`Authorization: Bearer`. All current in-repo callers pass relative
`/repos/{repo}/...` paths, so the bypass isn't currently exercised — but
the foot-gun is live, and any future caller that forwards a pagination
`Link:` header, a webhook-provided URL, or a cached next-page URL
immediately turns this into a real exfiltration primitive (the attacker
receives the server's replies but the server uses its credentials).

**Impact.** Server-side request forgery. Attacker-controlled URL reaches
the cloud metadata service (`169.254.169.254`), internal services, or
any host reachable from the server. The server's `GITHUB_TOKEN` is
attached to the request, enabling follow-on credential-replay if the
target accepts bearer tokens.

**Suggested fix.** Remove the `https://` fast-path; require `path` to
be relative. Resolve against a fixed `https://api.github.com` base and
re-verify the resolved origin. Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/272f70d>

---

## Report 2 — Medium — Prototype pollution in gateway-config `setNestedValue`

**Suggested title:** `Security: Prototype pollution in PUT /api/gateway-config via dot-notation setNestedValue`

**Severity:** Medium (`js/prototype-pollution-utility`, CWE-1321)

**Location:** `src/app/api/gateway-config/route.ts`, `setNestedValue`
helper (around line 273 in upstream HEAD at time of sprint).

**Vulnerability.** `setNestedValue(obj, path, value)` splits `path` on
`.` and walks `obj` assigning each segment. If any segment is
`__proto__`, `prototype`, or `constructor`, the walk mutates the
object's prototype chain instead of a nested property.

```ts
// PUT /api/gateway-config
// body: { updates: { "__proto__.polluted": "x" } }
// -> Object.prototype.polluted = "x"
```

**Impact.** Global prototype pollution. Every object created by the Node
process after the call inherits the polluted property. The endpoint
currently requires `admin` role, narrowing the blast radius, but
prototype pollution is global and survives the request — subsequent
unrelated endpoints, internal data processing, and (if the attacker
picks the right key) template engines or deserializers can be
subverted.

**Suggested fix.** Reject unsafe path segments at both the handler
layer (400 response) and inside `setNestedValue` (throw, as belt-and-
suspenders). Additionally traverse only own properties via
`Object.prototype.hasOwnProperty.call` to avoid accidental descent
into inherited keys like `toString`. Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/0be4594>

---

## Report 3 — High — Polynomial ReDoS in `parseNaturalSchedule`

**Suggested title:** `Security: Polynomial ReDoS in parseNaturalSchedule via unbounded natural-language input`

**Severity:** High (`js/polynomial-redos`, CWE-1333/CWE-400)

**Location:** `src/lib/schedule-parser.ts`, three regex sites at lines
99, 114, and 139 (all inside `parseNaturalSchedule`).

**Vulnerability.** `parseNaturalSchedule(input)` runs three natural-
language patterns with `(.+)` capture groups and adjacent `\s+`
quantifiers against arbitrary-length `input`. Pathological inputs
(e.g. `'every\t0\tat\t' + '\t'.repeat(1_000_000)`) trigger quadratic
backtracking. There is no upstream length cap before regex execution.

**Impact.** CPU-bound denial of service. A single request with a
~1 MB schedule string can pin a Node event-loop worker for tens of
seconds. The three affected patterns are all reachable through the
same function, so one payload exercises all three.

**Suggested fix.** Cap `input.length` to 256 characters at function
entry (legitimate schedules are always <64 characters). Reference
patch: <https://github.com/ExpertPartnersLLC/mission-control/commit/a88f95b>

---

## Report 4 — High — Polynomial ReDoS in `extractSchema` frontmatter parser

**Suggested title:** `Security: Polynomial ReDoS in extractSchema against large markdown frontmatter`

**Severity:** High (`js/polynomial-redos`, CWE-1333)

**Location:** `src/lib/memory-utils.ts`, `extractSchema` function,
regex sites at lines 78 and 83 (`required:\s*\[([^\]]*)\]` and
`optional:\s*\[([^\]]*)\]`).

**Vulnerability.** `extractSchema(content)` runs multi-megabyte markdown
content through a chain of regexes before any length bound. The outer
`_schema:\s*\n((?:\s{2,}.+\n?)*)` pattern and the inner `[^\]]*` class
applied to `block` have polynomial backtracking on pathological
backslash-heavy frontmatter. Content reaches this function through
`POST /api/memory` (a user-writable markdown file).

**Impact.** Same DoS shape as Report 3, but triggered via file write
rather than schedule parse. The request body limit is whatever
`bodyParser` allows (no tighter cap); a 1 MB pathological frontmatter
body pins the worker.

**Suggested fix.** Layered length caps before regex execution: slice
`content` to 64 KB, `fm` to 16 KB, `block` to 8 KB. Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/67bcf75>

---

## Report 5 — High — Polynomial ReDoS in `slugify` for project names

**Suggested title:** `Security: Polynomial ReDoS in slugify on project name input`

**Severity:** High (`js/polynomial-redos`, CWE-1333)

**Location:** `src/app/api/projects/route.ts`, `slugify` local helper
(unexported in upstream at time of sprint).

**Vulnerability.** `slugify` applies three regexes to the project name
before slicing to 64 characters. The `/^-+|-+$/g` pattern has polynomial
backtracking on pathological dash-heavy inputs (e.g. 1 MB of `-`
followed by a legitimate name). The `.slice(0, 64)` output cap comes
AFTER the regex chain, so the entire input runs through the regex first.

**Impact.** DoS via `POST /api/projects`. Operator-role required, but
any compromised operator credential can exploit.

**Suggested fix.** Cap `input.length` to 256 upfront (4× the 64-char
output cap). Same pattern for the companion `normalizePrefix` helper.
Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/439ed55>

---

## Report 6 — High — Resource exhaustion via unbounded provisioner timeout

**Suggested title:** `Security: Unbounded timeoutMs in mc-provisioner-daemon enables resource exhaustion`

**Severity:** High (`js/resource-exhaustion`, CWE-400)

**Location:** `ops/mc-provisioner-daemon.js`, `run` function, around
line 163 (`setTimeout(..., Math.max(1000, Number(timeoutMs || 10000)))`).

**Vulnerability.** The supervisory timer enforces a 1-second floor but
no ceiling. A client that sends `{timeoutMs: 2**53}` holds both the
spawned child process and the setTimeout handle indefinitely.

**Impact.** Handle exhaustion + child-process starvation. An authorized
caller (already past the shared token check) can still trivially hang
any number of workers.

**Suggested fix.** Extract clamp logic to a helper (`clampTimeout`)
that applies a 10-minute ceiling with a `Number.isFinite` guard. All
allowlisted commands complete in seconds; 10 minutes is generous.
Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/554569b>

---

## Report 7 — Medium — Defense-in-depth gap in `memory-search.indexFile`

**Suggested title:** `Security: memory-search.indexFile does not validate path containment`

**Severity:** Medium (`js/path-injection`, CWE-22 — defense-in-depth)

**Location:** `src/lib/memory-search.ts`, `indexFile(db, baseDir, relativePath)`
function, line 113 at time of sprint.

**Vulnerability.** `indexFile` passes `join(baseDir, relativePath)`
directly to `readFileSync` without an internal containment check. In
the current codebase every caller (memory POST/DELETE handlers) already
validates via `isPathAllowed` + `resolveSafeMemoryPath` upstream, so
the function is effectively safe today. But `indexFile` is an exported
library symbol — any future caller that forgets the upstream checks
reopens the path-traversal vulnerability without warning.

**Impact.** Latent. Real if a new caller is added that skips upstream
validation.

**Suggested fix.** Call `resolveWithin(baseDir, relativePath)` at the
top of `indexFile`; on error, log and return without touching the
filesystem or index. The downstream fs operation uses the resolved
safe path. Reference patch:
<https://github.com/ExpertPartnersLLC/mission-control/commit/6a02500>

---

## Report 8 — Defense-in-depth bundle (low individual impact, high coherence)

Four smaller hardenings that are individually theoretical but together
harden the codebase against future refactors:

1. **`src/lib/command.ts`**: assert `command` argument matches
   `/^[A-Za-z0-9_\-./]+$/` and rejects null bytes. `shell: false`
   already prevents shell-metacharacter interpretation of argv, but
   the assertion codifies the invariant that the executable name is
   always server-controlled.
2. **`src/lib/adapters/index.ts`**: use `Object.prototype.hasOwnProperty.call(adapters, framework)` for adapter
   lookup, preventing descent into inherited keys like `toString` or
   `constructor`.
3. **`src/app/api/agents/[id]/soul/route.ts`**: reject `template_name`
   values containing `/`, `\`, `..`, null bytes, leading `.`, or
   exceeding 128 characters — BEFORE calling `resolveWithin`. Improves
   error UX (clear 400 instead of a confusing 400 from the containment
   throw) and makes the invariant explicit.
4. **`src/components/markdown-renderer.tsx`**: tighten `stripHtml` to
   run a second pass stripping stray `<` characters from malformed tag
   carriers (e.g. `<script<`). Not an actual XSS fix — the downstream
   consumer is `react-markdown` which never renders raw HTML — but it
   closes the CodeQL `js/incomplete-multi-character-sanitization` alert
   cleanly.

Reference patch: <https://github.com/ExpertPartnersLLC/mission-control/commit/9cd70a3>

---

## Summary table

| # | Severity | Rule | File | Fork commit |
|---|---|---|---|---|
| 1 | Critical | js/request-forgery | src/lib/github.ts | 272f70d |
| 2 | Medium | js/prototype-pollution-utility | src/app/api/gateway-config/route.ts | 0be4594 |
| 3 | High | js/polynomial-redos | src/lib/schedule-parser.ts | a88f95b |
| 4 | High | js/polynomial-redos | src/lib/memory-utils.ts | 67bcf75 |
| 5 | High | js/polynomial-redos | src/app/api/projects/route.ts | 439ed55 |
| 6 | High | js/resource-exhaustion | ops/mc-provisioner-daemon.js | 554569b |
| 7 | Medium | js/path-injection (DiD) | src/lib/memory-search.ts | 6a02500 |
| 8 | bundle | multiple | command.ts, adapters, soul templates, markdown-renderer | 9cd70a3 |

## Disclosure recommendation

Report 1 (SSRF) and Report 2 (prototype pollution) warrant GitHub
Security Advisory draft with coordinated disclosure (request a CVE).
Reports 3–6 can be filed as standard public issues; they're DoS-class
and public tracking is fine. Reports 7 and 8 are defense-in-depth
improvements and can accompany the reports above as standard PRs.

---

**Status:** Drafts only. Awaiting approval from fork maintainer before
submission. Do not submit upstream without explicit sign-off.
