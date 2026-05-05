# Fork Notes — ExpertPartners/mission-control

This repository is a **private fork** of [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control), customized for deployment at Expert Partners LLC.

## Fork provenance

- **Forked from:** `builderz-labs/mission-control`
- **Fork date:** 2026-04-20
- **Original upstream tip at fork creation:** `503a289`
- **Last upstream tip we've integrated locally:** `14f34d1` (as of this commit; an `upstream` remote is configured for future syncs)

## Remote topology

This clone is configured with two remotes:

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `git@github.com:ExpertPartners/mission-control.git` | Our private EP-customized fork. `main` is our deployed state. |
| `upstream` | `https://github.com/builderz-labs/mission-control.git` | The OSS parent. Pull from here to get upstream fixes/features. |

To reproduce this topology on another clone:

```bash
git clone git@github.com:ExpertPartners/mission-control.git
cd mission-control
git remote add upstream https://github.com/builderz-labs/mission-control.git
git fetch upstream
```

## EP-specific files (do not upstream)

These paths exist **only in our fork**. Any upstream merge should leave them alone:

- `docker-compose.ep.yml` — EP-specific Docker Compose overlay
- `public/ep-brand.css`, `public/ep-logo-black.svg`, `public/ep-logo-white.svg`
- `src/app/ep-brand.css`
- `FORK.md` (this file)

## Upstream-path files we've modified (watch for merge conflicts)

When pulling upstream, these files will likely conflict — we have EP-specific changes on top of them:

- `Dockerfile` — build args for `NEXT_PUBLIC_GATEWAY_*` env vars
- `docker-compose.yml` — gateway env vars + `build.args` section
- `docker-compose.hardened.yml` — healthcheck port fix
- `src/app/api/status/route.ts` — container-aware status route
- `src/app/globals.css` — import of `ep-brand.css`

## Pulling upstream changes (standard flow)

```bash
git fetch upstream
git checkout main
git merge upstream/main        # or: git rebase upstream/main
# resolve conflicts in the paths listed above
git push origin main
```

For clean periodic syncs, consider rebasing EP commits on top of upstream:

```bash
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin main
```

## Deployment tags

Each deployed state of this fork is tagged `ep-deploy-YYYY-MM-DD`. Use the most recent tag as a known-good rollback target:

```bash
git tag --list 'ep-deploy-*' --sort=-creatordate | head -3
```

## What this fork is NOT

- Not a place to land upstream-eligible features. Contribute those to `builderz-labs/mission-control` via PR, then pull them back via the `upstream` remote.
- Not an independent rewrite. We stay close to upstream and accept their direction on core architecture.
- Not a production dashboard for customers — this runs internal EP operations only.
