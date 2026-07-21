#!/bin/bash
# Run on VPS to recover from 502 / crash after ADMS deploy
set -euo pipefail
cd /var/www/adforce-hr

echo "=== PM2 status ==="
pm2 status || true

echo "=== Recent error logs ==="
pm2 logs --err --lines 80 --nostream || pm2 logs --lines 80 --nostream || true

echo "=== Install server deps ==="
cd /var/www/adforce-hr
git pull origin main || true
cd /var/www/adforce-hr/server
npm install

echo "=== Restart ==="
pm2 restart all --update-env || pm2 restart adforce-api --update-env

sleep 2
echo "=== Health ==="
curl -sf http://127.0.0.1:4000/api/health || curl -sf http://127.0.0.1:4000/api/health || true
echo ""
echo "=== ADMS handshake smoke ==="
curl -s "http://127.0.0.1:4000/iclock/cdata?SN=NYU7253801377" | od -c | head -20 || true
echo ""
pm2 status
pm2 logs --lines 30 --nostream || true
