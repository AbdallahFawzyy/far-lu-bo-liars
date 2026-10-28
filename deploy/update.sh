#!/usr/bin/env bash
# Pulls the latest commit from GitHub and restarts the game if anything changed.
# Run every minute by the liars-den-update systemd timer (installed by setup.sh).
set -euo pipefail

DIR="/opt/liars-den"
cd "$DIR"

git fetch --depth 1 --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi

echo "Deploying $(git rev-parse --short origin/main): $(git log -1 --format=%s origin/main)"
git reset --hard --quiet origin/main
npm ci --omit=dev --no-audit --no-fund --silent
chown -R liarsden:liarsden "$DIR"
systemctl restart liars-den
echo "Deployed."
