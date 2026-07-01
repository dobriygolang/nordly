#!/usr/bin/env bash
# One-time cutover: druzya-prod @ /opt/project-druzya → nordly-prod @ /opt/project-nordly
# Run on VPS as root after DNS points trynordly.app → this host.
set -euo pipefail

OLD_DIR="${OLD_DIR:-/opt/project-druzya}"
NEW_DIR="${NEW_DIR:-/opt/project-nordly}"
GIT_URL="${GIT_URL:-https://github.com/dobriygolang/nordly.git}"
BRANCH="${BRANCH:-main}"

echo "==> Stop app containers (keep Postgres for in-place DB rename)"
cd "$OLD_DIR/deploy"
docker compose -f docker-compose.prod.yml --env-file .env stop \
  caddy identity identity-bot billing sandbox rooms tracker notes focus \
  grafana alloy prometheus redis node_exporter migrate 2>/dev/null || true

terminate_db_connections() {
  local db="$1"
  docker exec "$PG" psql -U druzya -d postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" \
    >/dev/null || true
}

echo "==> Rename Postgres databases (druzya_* → nordly_*)"
PG=druzya-prod-postgres-1
rename_db() {
  local from="$1" to="$2"
  docker exec "$PG" psql -U druzya -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$from'" | grep -q 1 || return 0
  docker exec "$PG" psql -U druzya -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$to'" | grep -q 1 && return 0
  terminate_db_connections "$from"
  docker exec "$PG" psql -U druzya -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$from\" RENAME TO \"$to\";"
  echo "  $from → $to"
}
rename_db druzya nordly
rename_db druzya_billing nordly_billing
rename_db druzya_sandbox nordly_sandbox
rename_db druzya_rooms nordly_rooms
rename_db druzya_tracker nordly_tracker
rename_db druzya_notes nordly_notes
rename_db druzya_focus nordly_focus

echo "==> Clone nordly repo"
if [ ! -d "$NEW_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$GIT_URL" "$NEW_DIR"
fi

echo "==> Build deploy/.env from old stack"
OLD_ENV="$OLD_DIR/deploy/.env"
NEW_ENV="$NEW_DIR/deploy/.env"
if [ ! -f "$OLD_ENV" ]; then
  echo "ERROR: missing $OLD_ENV"
  exit 1
fi
if [ -f "$NEW_ENV" ]; then
  cp "$NEW_ENV" "${NEW_ENV}.bak.$(date +%s)"
fi
sed -E \
  -e 's|https://druz9\.online|https://trynordly.app|g' \
  -e 's|https://api\.druz9\.online|https://api.trynordly.app|g' \
  -e 's|https://grafana\.druz9\.online|https://grafana.trynordly.app|g' \
  -e 's|https://app\.druz9\.online|https://trynordly.app|g' \
  -e 's|https://druz9\.ru|https://trynordly.app|g' \
  -e 's|https://app\.druz9\.ru|https://trynordly.app|g' \
  -e 's|/druzya_billing|/nordly_billing|g' \
  -e 's|/druzya_sandbox|/nordly_sandbox|g' \
  -e 's|/druzya_rooms|/nordly_rooms|g' \
  -e 's|/druzya_tracker|/nordly_tracker|g' \
  -e 's|/druzya_notes|/nordly_notes|g' \
  -e 's|/druzya_focus|/nordly_focus|g' \
  -e 's|@postgres:5432/druzya|@postgres:5432/nordly|g' \
  -e 's/HONE_CALLBACK_URL/NORDLY_CALLBACK_URL/' \
  -e 's|hone://settings|nordly://settings|g' \
  -e 's/CORS_ALLOWED_ORIGINS=.*/CORS_ALLOWED_ORIGINS=https:\/\/trynordly.app,https:\/\/app.trynordly.app/' \
  "$OLD_ENV" > "$NEW_ENV"
grep -q '^NORDLY_CALLBACK_URL=' "$NEW_ENV" || echo 'NORDLY_CALLBACK_URL=nordly://settings' >> "$NEW_ENV"
grep -q '^YANDEX_REDIRECT_URI=' "$NEW_ENV" && \
  sed -i 's|YANDEX_REDIRECT_URI=.*|YANDEX_REDIRECT_URI=https://api.trynordly.app/v1/auth/yandex/callback|' "$NEW_ENV"

echo "==> Copy JWT keys"
mkdir -p "$NEW_DIR/deploy/secrets/jwt"
cp -a "$OLD_DIR/deploy/secrets/jwt/." "$NEW_DIR/deploy/secrets/jwt/" 2>/dev/null || true
cd "$NEW_DIR/deploy" && make keys

echo "==> TLS cert for trynordly.app (requires port 80 + DNS)"
if [ ! -d /etc/letsencrypt/live/trynordly.app ]; then
  certbot certonly --webroot -w /var/www/html -d trynordly.app -d api.trynordly.app \
    -d app.trynordly.app -d grafana.trynordly.app --non-interactive --agree-tos \
    -m "${CADDY_EMAIL:-admin@trynordly.app}" || {
      echo "WARN: certbot failed — fix DNS A records to this server, then re-run certbot"
    }
fi

echo "==> Update nginx (trynordly + legacy druz9 redirect names)"
NGINX=/etc/nginx/sites-enabled/reality-fallback
cp "$NGINX" "/root/reality-fallback.bak.$(date +%s)"
cat > "$NGINX" <<'NGINX_EOF'
map $http_upgrade $connection_upgrade {
	default upgrade;
	''      close;
}

server {
	listen 127.0.0.1:8123 ssl proxy_protocol default_server;
	server_name dobriyy.mooo.com;

	ssl_certificate     /etc/letsencrypt/live/dobriyy.mooo.com/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/dobriyy.mooo.com/privkey.pem;
	ssl_protocols TLSv1.2 TLSv1.3;

	set_real_ip_from 127.0.0.0/8;
	real_ip_header proxy_protocol;

	root /var/www/dobriyy.mooo.com;
	index index.php index.html;

	location = /w6CZQP5hEbgmWZnrKtH.json {
		add_header profile-title "base64:YXV0b1hSQVk=";
		add_header routing-enable 0;
		try_files $uri =404;
	}

	location /r89nyn {
		proxy_pass http://127.0.0.1:8400;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
	}

	location / {
		try_files $uri $uri/ =404;
	}
}

server {
	listen 127.0.0.1:8123 ssl proxy_protocol;
	server_name trynordly.app app.trynordly.app api.trynordly.app grafana.trynordly.app cdn.trynordly.app
	            druz9.online app.druz9.online api.druz9.online grafana.druz9.online cdn.druz9.online
	            druz9.ru app.druz9.ru api.druz9.ru;

	ssl_certificate     /etc/letsencrypt/live/trynordly.app/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/trynordly.app/privkey.pem;
	ssl_protocols TLSv1.2 TLSv1.3;

	set_real_ip_from 127.0.0.0/8;
	real_ip_header proxy_protocol;

	location / {
		proxy_pass http://127.0.0.1:18080;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto https;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection $connection_upgrade;
	}
}

server {
	listen 80;
	listen [::]:80;
	server_name trynordly.app app.trynordly.app api.trynordly.app grafana.trynordly.app cdn.trynordly.app
	            druz9.online app.druz9.online api.druz9.online grafana.druz9.online cdn.druz9.online
	            druz9.ru app.druz9.ru api.druz9.ru;

	location /.well-known/acme-challenge/ {
		root /var/www/html;
	}

	location / {
		return 301 https://$host$request_uri;
	}
}
NGINX_EOF
nginx -t && systemctl reload nginx

echo "==> Stop old druzya stack (volumes kept)"
cd "$OLD_DIR/deploy"
docker compose -f docker-compose.prod.yml --env-file .env down --remove-orphans || true

COMPOSE_FILES="-f docker-compose.prod.yml -f docker-compose.migrate-volumes.yml"

echo "==> Build images + start Postgres (reuse druzya volume)"
cd "$NEW_DIR/deploy"
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 BUILDX_NO_DEFAULT_ATTESTATIONS=1
bash scripts/build-images.sh
docker compose $COMPOSE_FILES --env-file .env up -d postgres redis
docker compose $COMPOSE_FILES --env-file .env exec -T postgres \
  pg_isready -U "${POSTGRES_USER:-druzya}" -d nordly -t 60

bash scripts/ensure-prod-databases.sh
docker compose $COMPOSE_FILES --env-file .env run --rm migrate
docker compose $COMPOSE_FILES --env-file .env up -d --remove-orphans --wait --wait-timeout 600

echo "==> Smoke"
set -a; source .env; set +a
curl -sf -H "Host: api.trynordly.app" "http://127.0.0.1:${CADDY_HTTP_PORT:-18080}/healthz"
curl -sfI -H "Host: trynordly.app" "http://127.0.0.1:${CADDY_HTTP_PORT:-18080}/" | head -1

echo ""
echo "Cutover done. Old repo kept at $OLD_DIR (containers stopped)."
echo "After verification: rm -rf $OLD_DIR and docker volume prune if needed."
