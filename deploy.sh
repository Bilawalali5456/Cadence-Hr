#!/usr/bin/env bash
# Deploy Cadence HR from the project root.
# First time only: chmod +x deploy.sh

set -euo pipefail

echo "Deploying Cadence HR..."
git checkout -- .
git clean -fd
git pull origin main
chmod +x node_modules/.bin/vite
npx vite build
pm2 restart all
echo "Deploy complete!"
