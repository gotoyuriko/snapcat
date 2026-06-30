#!/usr/bin/env bash
#
# Start Expo behind a Cloudflare quick tunnel instead of Expo's shared ngrok
# (`--tunnel`) account. Metro runs locally on $PORT; cloudflared exposes it at a
# public https://<random>.trycloudflare.com URL, and EXPO_PACKAGER_PROXY_URL
# makes Expo advertise that URL (and wss) to Expo Go.
#
# Usage:   ./start-tunnel.sh           # uses port 8082
#          PORT=8083 ./start-tunnel.sh
#
set -euo pipefail

command -v cloudflared >/dev/null || { echo "✖ cloudflared not found on PATH"; exit 1; }

# CRITICAL: cloudflared and Metro MUST agree on the port. If we hardcoded a port
# and it were busy, Expo would silently bump to the next one while cloudflared
# kept forwarding to the dead port — the phone would then fail with
# "Failed to download remote update". So pick a port that is genuinely free and
# use that exact port for BOTH.
port_busy() { ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }
PORT="${PORT:-8082}"
while port_busy "$PORT"; do
  echo "• port $PORT is busy, trying $((PORT+1))…"
  PORT=$((PORT+1))
  [[ "$PORT" -gt 8099 ]] && { echo "✖ no free port in 8082-8099"; exit 1; }
done
echo "• using free port $PORT for Metro + tunnel"

LOG="$(mktemp -t cloudflared-XXXXXX.log)"
CF_PID=""

cleanup() {
  [[ -n "$CF_PID" ]] && kill "$CF_PID" 2>/dev/null || true
  rm -f "$LOG" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Starting cloudflared quick tunnel → http://localhost:$PORT ..."
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
CF_PID=$!

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  # Wait until the edge connection is actually registered, not just the URL printed,
  # otherwise the public URL 502s/times out for the first few seconds.
  [[ -n "$URL" ]] && grep -q "Registered tunnel connection" "$LOG" && break
  kill -0 "$CF_PID" 2>/dev/null || { echo "✖ cloudflared exited early:"; cat "$LOG"; exit 1; }
  sleep 1
done
[[ -n "$URL" ]] || { echo "✖ Timed out getting a trycloudflare URL:"; cat "$LOG"; exit 1; }

echo "✔ Public tunnel URL: $URL"
echo "▶ Starting Expo (Metro on :$PORT, advertising $URL to Expo Go)..."
export EXPO_PACKAGER_PROXY_URL="$URL"
npx expo start --port "$PORT" --host localhost
