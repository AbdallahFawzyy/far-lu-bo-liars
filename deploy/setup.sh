#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 22.04/24.04 DigitalOcean droplet.
# Installs Node.js and Caddy, runs Liar's Den as a service, and serves it over HTTPS at
# https://<droplet-ip>.sslip.io (free certificate, no domain needed).
#
#   curl -fsSL https://raw.githubusercontent.com/AbdallahFawzyy/far-lu-bo-liars/main/deploy/setup.sh | sudo bash
#
# Run it again any time to pull the latest version from GitHub and restart.
set -euo pipefail

REPO="https://github.com/AbdallahFawzyy/far-lu-bo-liars.git"
DIR="/opt/liars-den"
# The repo is owned by the liarsden service user; let root run git in it.
git config --global --add safe.directory "$DIR" 2>/dev/null || true
PORT=3000

export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> Installing Caddy (HTTPS)"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

apt-get install -y git

echo "==> Fetching the game"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin main
  git -C "$DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"
npm ci --omit=dev

id -u liarsden >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin liarsden
chown -R liarsden:liarsden "$DIR"

echo "==> Creating the service"
cat > /etc/systemd/system/liars-den.service <<EOF
[Unit]
Description=Liar's Den game server
After=network.target

[Service]
User=liarsden
WorkingDirectory=$DIR
Environment=PORT=$PORT
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
echo "==> Turning on auto-deploy (checks GitHub every minute)"
cat > /etc/systemd/system/liars-den-update.service <<EOF
[Unit]
Description=Pull Liar's Den from GitHub and redeploy if changed

[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/deploy/update.sh
EOF
cat > /etc/systemd/system/liars-den-update.timer <<EOF
[Unit]
Description=Check GitHub for Liar's Den updates every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now liars-den
systemctl restart liars-den
systemctl enable --now liars-den-update.timer

IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
HOST="${IP}.sslip.io"
echo "==> Configuring HTTPS for $HOST"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl reload caddy || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp && ufw allow 443/tcp
fi

echo
echo "Liar's Den is running at: https://$HOST"
echo "(The HTTPS certificate can take up to a minute on the first visit.)"
