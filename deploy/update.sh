#!/usr/bin/env bash
# Pulls the latest commit from GitHub and restarts the game if anything changed.
# Run every minute by the liars-den-update systemd timer (installed by setup.sh).
set -euo pipefail

DIR="/opt/liars-den"
# The repo is owned by the liarsden service user; let root run git in it.
git config --system --get-all safe.directory 2>/dev/null | grep -qx "$DIR" || git config --system --add safe.directory "$DIR"
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
