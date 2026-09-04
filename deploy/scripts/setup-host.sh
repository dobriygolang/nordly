#!/usr/bin/env bash
# First-boot host setup for a dedicated Nordly VPS (no xray).
# Run as root on Ubuntu 22.04+/Debian 12+.
#
# Usage:
#   bash deploy/scripts/setup-host.sh
#   CERTBOT_DOMAINS="trynordly.app www.trynordly.app api.trynordly.app app.trynordly.app grafana.trynordly.app cdn.trynordly.app s3.trynordly.app" \
#     bash deploy/scripts/setup-host.sh --certs
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run as root" >&2
  exit 1
fi

EMAIL="${CADDY_EMAIL:-admin@trynordly.app}"
DOMAINS="${CERTBOT_DOMAINS:-trynordly.app www.trynordly.app api.trynordly.app app.trynordly.app grafana.trynordly.app cdn.trynordly.app s3.trynordly.app}"
ISSUE_CERTS=0
if [[ "${1:-}" == "--certs" ]]; then
  ISSUE_CERTS=1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y dist-upgrade
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg lsb-release \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose v2 required" >&2
  exit 1
fi

install -d -m 755 /var/www/html
install -d -m 700 -o 65534 -g 65534 /var/lib/sandbox-work

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_SRC="$ROOT/nginx-trynordly.direct.conf.example"
SITE_DST=/etc/nginx/sites-available/trynordly.app

install_http_only_site() {
  cat > "$SITE_DST" <<'EOF'
server {
	listen 80;
	listen [::]:80;
	server_name trynordly.app www.trynordly.app api.trynordly.app app.trynordly.app code.trynordly.app grafana.trynordly.app cdn.trynordly.app s3.trynordly.app;

	location /.well-known/acme-challenge/ {
		root /var/www/html;
	}

	location / {
		return 200 'nordly host pending tls\n';
		add_header Content-Type text/plain;
	}
}
EOF
}

if [[ -f "$SITE_SRC" ]]; then
  if [[ -f /etc/letsencrypt/live/trynordly.app/fullchain.pem ]]; then
    cp "$SITE_SRC" "$SITE_DST"
  else
    install_http_only_site
  fi
  ln -sfn "$SITE_DST" /etc/nginx/sites-enabled/trynordly.app
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx || systemctl restart nginx
fi

if [[ "$ISSUE_CERTS" -eq 1 ]]; then
  domain_args=()
  for d in $DOMAINS; do
    domain_args+=(-d "$d")
  done
  certbot certonly --webroot -w /var/www/html \
    --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring \
    "${domain_args[@]}"
  cp "$SITE_SRC" "$SITE_DST"
  nginx -t
  systemctl reload nginx
fi

echo
echo "Host setup done."
echo "Next:"
echo "  1. Fill /opt/project-nordly/deploy/.env (see PRODUCTION_CHECKLIST.md)"
echo "  2. cd /opt/project-nordly/deploy && make keys"
echo "  3. Issue certs: $0 --certs"
echo "  4. GitHub Actions deploy, or: make up"
