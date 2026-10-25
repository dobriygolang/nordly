# Release process

Development and releases use `main`. Linear is optional.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Development and tagged releases; always deployable |

### Prepare a release

```bash
git checkout main && git pull
# run relevant local checks and commit the release changes
git push origin main
```

Tag the intended commit on `main`. Create other branches only when the user asks.
After pushing, report the commit or tag. The user checks pipelines and reports
failures; agents inspect or monitor CI only when explicitly requested.

## Tags

| Artifact | Tag format | Example |
|----------|------------|---------|
| Nordly desktop (Tauri) | `nordly-vMAJOR.MINOR.PATCH` | `nordly-v0.0.1` |
| Backend deploy | git SHA on `main` | `make deploy` on VPS |

CI builds desktop installers on `nordly-v*` tags (see `.github/workflows/nordly-release.yml`).

## Commits

When the user provides a Linear issue, reference it:

```
[NOR-123] Short description focused on why.
```

Otherwise use a brief commit subject without Linear. Do not require creating a task.

## Production deploy

From the VPS (`/opt/project-nordly`):

```bash
git fetch && git checkout main && git pull
cd deploy
make deploy                                  # incremental build + migrate + up
```

Full database wipe (empty prod — **destructive**):

```bash
cd deploy
bash scripts/prod-clean-slate.sh
```

## Pre-release checklist

- [ ] If a Linear release epic is used, close or tag it
- [ ] `bash deploy/scripts/audit-env.sh` — no obsolete `.env` keys
- [ ] Grafana: all Prometheus targets `up`; **Product** dashboard provisioned (`deploy/grafana/dashboards/nordly-product.json`)
- [ ] Smoke: `make smoke` from `deploy/` — check `identity_auth_total` / `http_requests_total` after login
- [ ] Desktop tag pushed: `git tag nordly-vX.Y.Z && git push origin nordly-vX.Y.Z`
