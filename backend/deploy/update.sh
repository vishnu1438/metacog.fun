#!/usr/bin/env bash
# Redeploy after pushing changes to GitHub. Run on the server:
#   bash /var/www/speedmath/backend/deploy/update.sh
set -euo pipefail

APP_DIR=/var/www/speedmath

cd "$APP_DIR"
git pull --ff-only

cd "$APP_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt --quiet

sudo systemctl restart speedmath
sleep 2
curl -fsS http://127.0.0.1:8000/api/health && echo
echo "Deployed OK. Static files (frontend/) are live immediately."