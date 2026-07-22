#!/bin/bash
# Run on VPS as root (Hostinger browser terminal or SSH as root)
# Deploys latest ADMS code + ensures Nginx serves /iclock/ on HTTP without redirect.
set -euo pipefail

APP_DIR="/var/www/adforce-hr"
NGINX_CANDIDATES=(
  "/etc/nginx/sites-available/hrms"
  "/etc/nginx/sites-available/adforce-hr"
)

find_nginx_site() {
  for candidate in "${NGINX_CANDIDATES[@]}"; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

wait_for_api() {
  local url="http://127.0.0.1:4000/api/health"
  local max_attempts=60
  local attempt=1

  echo "Waiting for API on port 4000 (up to ${max_attempts}s)..."
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "API ready after ${attempt}s"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  echo "WARNING: API did not respond at $url within ${max_attempts}s"
  pm2 logs adforce-api --lines 30 --nostream 2>/dev/null || true
  return 1
}

echo "=== 1. Pull latest code ==="
cd "$APP_DIR"
git pull origin main

echo "=== 2. Install dependencies & build ==="
cd "$APP_DIR/server" && npm install
cd "$APP_DIR" && npm install && npm run build

echo "=== 3. Ensure Nginx ADMS rules (HTTP /iclock/ before HTTPS redirect) ==="
NGINX_SITE=""
if NGINX_SITE="$(find_nginx_site)"; then
  if grep -q "location /iclock/" "$NGINX_SITE"; then
    echo "OK: /iclock/ block found in $NGINX_SITE"
  else
    echo "WARNING: $NGINX_SITE has no /iclock/ block."
    echo "Install: sudo cp $APP_DIR/deploy/nginx/hrms.adforcesolutions.com.conf /etc/nginx/sites-available/hrms"
    echo "         sudo ln -sf /etc/nginx/sites-available/hrms /etc/nginx/sites-enabled/hrms"
  fi
else
  echo "WARNING: No Nginx site file found (checked: ${NGINX_CANDIDATES[*]})"
  echo "Install: sudo cp $APP_DIR/deploy/nginx/hrms.adforcesolutions.com.conf /etc/nginx/sites-available/hrms"
fi

echo "=== 4. Restart API (schema auto-migrates on boot) ==="
cd "$APP_DIR/server"
pm2 restart adforce-api --update-env || pm2 start index.js --name adforce-api
API_READY=0
if wait_for_api; then
  API_READY=1
else
  echo "WARNING: Continuing deploy — Nginx reload and smoke tests will still run."
fi

echo "=== 5. Install / reload Nginx (HTTP/1.0 iclock — no chunked encoding) ==="
if [ -f "$APP_DIR/deploy/nginx/hrms.adforcesolutions.com.conf" ]; then
  cp "$APP_DIR/deploy/nginx/hrms.adforcesolutions.com.conf" /etc/nginx/sites-available/hrms
  ln -sf /etc/nginx/sites-available/hrms /etc/nginx/sites-enabled/hrms
fi
nginx -t && systemctl reload nginx

echo "=== 6. Header smoke tests ==="
set +e
echo "--- Direct Node :4000 ---"
curl -v "http://127.0.0.1:4000/iclock/cdata?SN=DIRECTTEST" 2>&1 | sed -n '1,40p'
echo ""
echo "--- Via Nginx :80 ---"
curl -v "http://hrms.adforcesolutions.com/iclock/cdata?SN=NGINXTEST" 2>&1 | sed -n '1,40p'
echo ""
echo -n "API health: "
curl -sf "http://127.0.0.1:4000/api/health" || echo "FAIL"
echo ""
echo -n "Recent iclock hits in Nginx log: "
grep -c iclock /var/log/nginx/access.log 2>/dev/null || echo "0"
echo ""
set -e

if [ "$API_READY" -eq 0 ]; then
  echo "=== Deploy finished with warnings: API was not healthy within the wait window ==="
else
  echo "=== Done. Device URL: http://hrms.adforcesolutions.com/iclock/cdata (HTTP port 80) ==="
fi
pm2 logs adforce-api --lines 20 --nostream 2>/dev/null | grep -i adms || echo "(no adms logs yet — waiting for device)"
