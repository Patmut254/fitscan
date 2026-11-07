#!/usr/bin/env bash
# One-command production build: React app + Django static files + database migrations.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
npm ci
npm run build
cd ../backend
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate --noinput
