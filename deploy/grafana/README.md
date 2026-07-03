# Grafana — nordly

## Self-hosted (default)

```bash
# deploy/.env
GRAFANA_ADMIN_PASSWORD=...

cd deploy
docker compose -f docker-compose.prod.yml --profile monitoring up -d prometheus grafana
```

| UI | URL |
|----|-----|
| Grafana | https://grafana.trynordly.app (`admin` / `$GRAFANA_ADMIN_PASSWORD`) |
| Prometheus (tunnel) | `ssh -L 9099:127.0.0.1:9099 root@server` → localhost:9099 |

Dashboards auto-import from `deploy/grafana/dashboards/`.

## Grafana Cloud (optional)

Set in `.env`:

```bash
GRAFANA_CLOUD_PROMETHEUS_URL=...
GRAFANA_CLOUD_PROMETHEUS_USER=...
GRAFANA_CLOUD_PROMETHEUS_API_KEY=...
```

Start Alloy: `docker compose … --profile monitoring up -d alloy`

Import JSON dashboards from `deploy/grafana/dashboards/` via UI or API.

## Key metrics

| Metric | Use |
|--------|-----|
| `http_requests_total`, `http_request_duration_seconds` | RPS, latency (all prod services) |
| `up` | service health (see `deploy/prometheus-alerts.yml`) |
| `billing_plans_*`, `billing_entitlements_*` | billing catalog + entitlements cache |
| `identity_auth_total`, `tracker_work_tasks_total`, `focus_sessions_total` | product activity |
| `billing_usage_consume_total`, `billing_subscriptions_total`, `billing_webhook_events_total` | billing / monetization |
| `node_memory_*` | host RAM (node_exporter) |

Dashboards: **Platform**, **HTTP routes**, **Billing**, **Product** (`deploy/grafana/dashboards/`).

| JSON file | Dashboard title |
|-----------|-----------------|
| `nordly-platform.json` | nordly — Platform |
| `nordly-http-routes.json` | nordly — HTTP routes |
| `nordly-billing.json` | nordly — Billing |
| `nordly-product.json` | nordly — Product |

**Product dashboard label values:**

- `identity_auth_total`: `method=telegram|refresh`, `result=ok|invalid_code|invalid_token`
- `tracker_work_tasks_total`: `action=create|complete|status_change|delete|schedule|unschedule|conference`
- `focus_sessions_total`: `result=started|completed|abandoned`
- `billing_usage_consume_total`: `result=allowed|limit_exceeded|not_usage_entitlement`

Retired services (interview, recommendation, admin) are not scraped in prod.
