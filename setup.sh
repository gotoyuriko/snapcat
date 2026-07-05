#!/usr/bin/env bash
#
# One-shot setup + start for CodingKitty.
#
# Installs dependencies, brings up Postgres/Temporal/MinIO via Docker, applies
# migrations, seeds base data, then starts the API server, Temporal worker,
# and Expo (LAN mode) in the background. Prints the URL to open in Expo Go.
#
# Requires: Node.js 20+, Docker, npm. Your phone must be on the same Wi-Fi
# network as this computer — if it isn't reachable (e.g. isolated campus/venue
# Wi-Fi), see packages/client/start-tunnel.sh for a tunnel-based alternative.
#
# Usage:   ./setup.sh
# Re-run anytime — each step is safe to repeat (migrations/seed are idempotent,
# docker compose up is a no-op if already running).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

say() { echo "▶ $1"; }
ok()  { echo "✔ $1"; }
die() { echo "✖ $1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------
say "Checking prerequisites..."
command -v node >/dev/null || die "Node.js not found. Install Node 20+ from https://nodejs.org"
command -v npm  >/dev/null || die "npm not found (should ship with Node.js)"
command -v docker >/dev/null || die "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
docker compose version >/dev/null 2>&1 || die "docker compose not available. Update Docker Desktop."

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node 20+ required, found $(node -v)"
ok "Node $(node -v), Docker $(docker --version | cut -d, -f1)"

# ---------------------------------------------------------------------------
# 2. Install & configure
# ---------------------------------------------------------------------------
say "Installing dependencies (npm install)..."
(cd "$ROOT" && npm install) || die "npm install failed"
ok "Dependencies installed"

if [[ ! -f "$ROOT/packages/server/.env" ]]; then
  cp "$ROOT/packages/server/.env.example" "$ROOT/packages/server/.env"
  ok "Created packages/server/.env from .env.example"
else
  ok "packages/server/.env already exists, leaving it as-is"
fi

# ---------------------------------------------------------------------------
# 3. Backing services + database
# ---------------------------------------------------------------------------
say "Starting Docker services (Postgres, Temporal, MinIO)..."
(cd "$ROOT" && docker compose up -d) || die "docker compose up failed"

say "Waiting for Postgres to be healthy..."
for _ in $(seq 1 30); do
  status="$(docker inspect --format='{{.State.Health.Status}}' codingkitty-db 2>/dev/null || echo "starting")"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
[[ "$status" == "healthy" ]] || die "Postgres did not become healthy in time — check 'docker compose logs db'"
ok "Postgres is healthy"

say "Applying database migrations..."
(cd "$ROOT/packages/server" && npx prisma migrate deploy) || die "prisma migrate deploy failed"
ok "Migrations applied"

say "Seeding base data (food items + certified partners)..."
(cd "$ROOT/packages/server" && npm run prisma:seed) || die "seed failed"
ok "Base data seeded"

# ---------------------------------------------------------------------------
# 4. Start the app
# ---------------------------------------------------------------------------
say "Stopping any previous run..."
pkill -9 -f 'ts-node-dev.*packages/server' 2>/dev/null || true
pkill -9 -f 'ts-node.*workflows/worker' 2>/dev/null || true
pkill -9 -f 'expo start' 2>/dev/null || true
sleep 1

# Best-effort LAN IP detection (Linux, macOS, WSL2).
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$LAN_IP" ]] && LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
[[ -z "$LAN_IP" ]] && LAN_IP="$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)"
[[ -z "$LAN_IP" ]] && die "Could not auto-detect your LAN IP. Find it manually (ipconfig/ifconfig) and run:\n  EXPO_PUBLIC_API_URL=http://<YOUR-IP>:3000 npx expo start   (from packages/client)"
ok "Detected LAN IP: $LAN_IP"

say "Starting API server..."
(cd "$ROOT" && nohup npm run dev > "$LOG_DIR/server.log" 2>&1 &)

say "Starting Temporal worker..."
(cd "$ROOT/packages/server" && nohup npm run worker > "$LOG_DIR/worker.log" 2>&1 &)

say "Waiting for the API server to come up..."
for _ in $(seq 1 30); do
  curl -sS -m 1 -o /dev/null "http://127.0.0.1:3000" && break
  sleep 1
done

say "Starting Expo (LAN mode)..."
(cd "$ROOT/packages/client" && EXPO_PUBLIC_API_URL="http://$LAN_IP:3000" nohup npx expo start > "$LOG_DIR/expo.log" 2>&1 &)

say "Waiting for Metro to print the app URL..."
METRO_URL=""
for _ in $(seq 1 40); do
  METRO_URL="$(grep -oE 'exp://[0-9.]+:[0-9]+' "$LOG_DIR/expo.log" 2>/dev/null | head -1)"
  [[ -n "$METRO_URL" ]] && break
  sleep 1
done

echo ""
echo "=============================================================="
ok "CodingKitty is running."
echo "  API server:      http://$LAN_IP:3000   (logs: logs/server.log)"
echo "  Temporal worker:  logs/worker.log"
if [[ -n "$METRO_URL" ]]; then
  echo "  Mobile app:       $METRO_URL"
  echo ""
  echo "  Open Expo Go on your phone (same Wi-Fi network) and scan the QR"
  echo "  code below, or enter the URL above manually:"
  echo ""
  grep -A 40 "Metro waiting" "$LOG_DIR/expo.log" 2>/dev/null | sed -n '/█/,/^$/p' || cat "$LOG_DIR/expo.log" | tail -40
else
  echo "  Mobile app:       still starting — check logs/expo.log for the QR code"
fi
echo ""
echo "  Phone can't reach $LAN_IP? Your network may isolate devices —"
echo "  use packages/client/start-tunnel.sh instead (needs cloudflared)."
echo ""
echo "  Stop everything with: ./stop.sh"
echo "=============================================================="
