# Release process

Production releases use **release branches** and **Linear** for task tracking.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Integration; always deployable |
| `release/vX.Y.Z` | Stabilization before a tagged release (bugfixes only) |

### Cut a release branch

```bash
git checkout main && git pull
git checkout -b release/v0.0.2
# fix-only commits on this branch
git push -u origin release/v0.0.2
```

Merge `release/vX.Y.Z` → `main` when stable, then tag.

## Tags

| Artifact | Tag format | Example |
|----------|------------|---------|
| Nordly desktop (Tauri) | `nordly-vMAJOR.MINOR.PATCH` | `nordly-v0.0.1` |
| Backend deploy | git SHA on `main` / release branch | `make deploy` on VPS |

CI builds desktop installers on `nordly-v*` tags (see `.github/workflows/nordly-release.yml`).

## Commits

Every commit references a Linear issue:

```
[NOR-123] Short description focused on why.
```

Create the Linear task first; use its id in the commit subject.

## Production deploy

From the VPS (`/opt/project-nordly`):

```bash
git fetch && git checkout main && git pull   # or release branch
cd deploy
make deploy                                  # incremental build + migrate + up
```

Full database wipe (empty prod — **destructive**):

```bash
cd deploy
bash scripts/prod-clean-slate.sh
```

## Pre-release checklist

- [ ] Linear release epic closed or tagged
- [ ] `bash deploy/scripts/audit-env.sh` — no obsolete `.env` keys
- [ ] Grafana: all Prometheus targets `up`; **Product** dashboard provisioned (`deploy/grafana/dashboards/nordly-product.json`)
- [ ] Smoke: `make smoke` from `deploy/` — check `identity_auth_total` / `http_requests_total` after login
- [ ] Desktop tag pushed: `git tag nordly-vX.Y.Z && git push origin nordly-vX.Y.Z`
