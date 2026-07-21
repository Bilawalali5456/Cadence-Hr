#!/bin/bash
# Run on VPS as root (Hostinger browser terminal or: ssh root@187.127.138.114)
# Deploys latest ADMS code + ensures Nginx serves /iclock/ on HTTP without redirect.
set -euo pipefail

APP_DIR="/var/www/adforce-hr"
NGINX_SITE="/etc/nginx/sites-available/adforce-hr"

echo "=== 1. Pull latest code ==="
cd "$APP_DIR"
git pull origin main

echo "=== 2. Install dependencies & build ==="
cd "$APP_DIR/server" && npm install
cd "$APP_DIR" && npm install && npm run build

echo "=== 3. Ensure Nginx ADMS rules (HTTP /iclock/ before HTTPS redirect) ==="
if ! grep -q "location /iclock/" "$NGINX_SITE" 2>/dev/null; then
  echo "WARNING: $NGINX_SITE has no /iclock/ block."
  echo "Copy deploy/nginx/hrms.adforcesolutions.com.conf or add manually."
else
  echo "OK: /iclock/ block found in Nginx config"
fi

echo "=== 4. Restart API (schema auto-migrates on boot) ==="
cd "$APP_DIR/server"
pm2 restart adforce-api --update-env || pm2 start index.js --name adforce-api

echo "=== 5. Reload Nginx ==="
nginx -t && systemctl reload nginx

echo "=== 6. Smoke tests ==="
echo -n "HTTP /iclock/cdata: "
curl -sf "http://127.0.0.1:4000/iclock/cdata?SN=DEPLOYTEST" | head -1 || curl -sf "http://hrms.adforcesolutions.com/iclock/cdata?SN=DEPLOYTEST" | head -1
echo ""
echo -n "API health: "
curl -sf "http://127.0.0.1:4000/api/health"
echo ""
echo -n "Recent iclock hits in Nginx log: "
grep -c iclock /var/log/nginx/access.log 2>/dev/null || echo "0"
echo ""
echo "=== Done. Device URL: http://hrms.adforcesolutions.com/iclock/cdata (HTTP port 80) ==="
pm2 logs adforce-api --lines 20 --nostream 2>/dev/null | grep -i adms || echo "(no adms logs yet — waiting for device)"
