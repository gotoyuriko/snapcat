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

# Kill processes whose command line matches a pattern. Git Bash on Windows
# ships no pkill, so fall back to PowerShell there — otherwise the cleanup
# silently does nothing and the running API keeps the Prisma DLL locked.
kill_matching() {
  local pattern="$1"
  if command -v pkill >/dev/null 2>&1; then
    pkill -9 -f "$pattern" 2>/dev/null || true
  else
    powershell.exe -NoProfile -Command \
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match '$pattern' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" \
      2>/dev/null || true
  fi
}

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
# Stop any previous run FIRST: on Windows, a running API/worker holds the
# Prisma query-engine DLL and makes `npm install` fail with EPERM on rename.
say "Stopping any previous run..."
kill_matching 'ts-node-dev'
kill_matching 'worker\.ts'
kill_matching 'expo start'
sleep 1

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
# (Previous run already stopped in step 2, before npm install.)

# Best-effort LAN IP detection (Windows Git Bash, Linux, macOS, WSL2).
LAN_IP=""
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Windows Git Bash: `ipconfig getifaddr` is a macOS command — Windows'
    # ipconfig would dump its usage text to stdout and poison $LAN_IP.
    # Ask PowerShell for the first real IPv4 (skip loopback + link-local).
    LAN_IP="$(powershell.exe -NoProfile -Command \
      "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -ne '127.0.0.1' -and \$_.IPAddress -notlike '169.254.*' -and \$_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' } | Select-Object -First 1).IPAddress" \
      2>/dev/null | tr -d '\r' | head -1)"
    ;;
  Darwin)
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
    ;;
  *)
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -z "$LAN_IP" ]] && LAN_IP="$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)"
    ;;
esac
# Sanity check: must look like an IPv4 address, not error text.
[[ "$LAN_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || LAN_IP=""
[[ -z "$LAN_IP" ]] && die "Could not auto-detect your LAN IP. Find it manually (ipconfig/ifconfig) and run:
  EXPO_PUBLIC_API_URL=http://<YOUR-IP>:3000 npx expo start   (from packages/client)"
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
METRO_PORT=8081
# Expo's own LAN-IP auto-detection is unreliable under WSL2/some VM setups and
# can report 127.0.0.1 even with --host lan, so force the hostname explicitly
# (same fix packages/client/start-tunnel.sh uses for its tunnel URL).
(cd "$ROOT/packages/client" && \
  EXPO_PUBLIC_API_URL="http://$LAN_IP:3000" \
  REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP" \
  nohup npx expo start --port "$METRO_PORT" > "$LOG_DIR/expo.log" 2>&1 &)

say "Waiting for Metro to come up..."
METRO_URL=""
for _ in $(seq 1 40); do
  # The Expo CLI's own QR/URL banner only renders through its interactive
  # terminal UI and never reaches a redirected log file, so read the app URL
  # straight from Metro's manifest endpoint instead of scraping CLI output.
  HOST_URI="$(curl -sS -m 1 "http://127.0.0.1:$METRO_PORT" 2>/dev/null | grep -oE '"hostUri":"[^"]*"' | cut -d'"' -f4)"
  [[ -n "$HOST_URI" ]] && { METRO_URL="exp://$HOST_URI"; break; }
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
  echo "  Open Expo Go on your phone (same Wi-Fi network) and enter the URL"
  echo "  above manually, or run 'npx expo start' yourself in packages/client"
  echo "  to get a scannable QR code."
else
  echo "  Mobile app:       still starting — check logs/expo.log, or run"
  echo "                     'curl http://localhost:$METRO_PORT' for the manifest"
fi
echo ""
echo "  Phone can't reach $LAN_IP? Your network may isolate devices —"
echo "  use packages/client/start-tunnel.sh instead (needs cloudflared)."
echo ""
echo "  Stop everything with: ./stop.sh"
echo "=============================================================="
