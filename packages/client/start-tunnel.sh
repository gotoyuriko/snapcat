#!/usr/bin/env bash
#
# Start Expo behind Cloudflare quick tunnels instead of Expo's shared ngrok
# (`--tunnel`) account. Brings up TWO tunnels so a physical device works on any
# network (no LAN/WSL2 reachability needed):
#
#   1. Metro (this app's dev server) -> EXPO_PACKAGER_PROXY_URL  (so Expo Go
#      downloads the JS bundle over https/wss)
#   2. Backend API on $API_PORT     -> EXPO_PUBLIC_API_URL       (so api.ts /
#      socket.ts reach the server; inlined into the bundle each run)
#
# Run your backend (port 3000) separately; the API tunnel 502s until it's up.
#
# Usage:   ./start-tunnel.sh                 # Metro auto-port, API port 3000
#          API_PORT=4000 ./start-tunnel.sh
#          NO_API_TUNNEL=1 ./start-tunnel.sh # Metro tunnel only
#
set -euo pipefail

# Add common Windows install locations so cloudflared is found under Git Bash
# Add user home so a locally installed cloudflared binary is found
export PATH="$HOME:$PATH"

command -v cloudflared >/dev/null || { echo "✖ cloudflared not found on PATH"; exit 1; }

API_PORT="${API_PORT:-3000}"
CF_PIDS=()
LOGS=()
WATCHDOG_PID=""

cleanup() {
  [[ -n "$WATCHDOG_PID" ]] && kill "$WATCHDOG_PID" 2>/dev/null || true
  for pid in "${CF_PIDS[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done
  for f in "${LOGS[@]:-}"; do rm -f "$f" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

# Start a cloudflared quick tunnel to localhost:$1; echo the public URL on stdout
# (all status goes to stderr so it doesn't pollute the captured URL).
start_quick_tunnel() {
  local target_port="$1" log url
  log="$(mktemp -t cloudflared-XXXXXX.log)"
  LOGS+=("$log")
  # --protocol http2: use TCP/HTTP2 instead of the default QUIC (UDP). QUIC is
  #   unreliable on WSL2 / flaky networks — connections drop and cloudflared exits
  #   ("no more connections active and exiting"), leaving Expo advertising a dead
  #   URL that no longer resolves (NXDOMAIN on the phone).
  # --retries 5 / --grace-period: keep trying to re-establish rather than giving up.
  # 127.0.0.1 (not localhost): localhost can resolve to IPv6 ::1 first, and an
  #   origin bound only to IPv4 would then refuse the connection -> 502.
  cloudflared tunnel --no-autoupdate --protocol http2 --retries 5 \
    --url "http://127.0.0.1:$target_port" >"$log" 2>&1 &
  CF_PIDS+=("$!")
  local cf_pid="$!"
  url=""
  for _ in $(seq 1 30); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)"
    # Wait for the edge connection to actually register, not just the URL print,
    # else the public URL 502s/times out for the first few seconds.
    [[ -n "$url" ]] && grep -q "Registered tunnel connection" "$log" && break
    kill -0 "$cf_pid" 2>/dev/null || { echo "✖ cloudflared exited early for port $target_port:" >&2; cat "$log" >&2; return 1; }
    sleep 1
  done
  [[ -n "$url" ]] || { echo "✖ timed out getting a tunnel URL for port $target_port" >&2; return 1; }
  echo "$url"
}

# cloudflared and Metro MUST agree on the port. If we hardcoded one and it were
# busy, Expo would silently bump to the next port while cloudflared kept
# forwarding to the dead one -> the phone fails with "Failed to download remote
# update". So pick a genuinely free port and use it for BOTH.
port_busy() { ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }
PORT="${PORT:-8082}"
while port_busy "$PORT"; do
  echo "• port $PORT is busy, trying $((PORT+1))…"
  PORT=$((PORT+1))
  [[ "$PORT" -gt 8099 ]] && { echo "✖ no free port in 8082-8099"; exit 1; }
done
echo "• using free port $PORT for Metro + tunnel"

echo "▶ Starting Metro tunnel → http://localhost:$PORT ..."
METRO_URL="$(start_quick_tunnel "$PORT")"
echo "✔ Metro tunnel:   $METRO_URL"
export EXPO_PACKAGER_PROXY_URL="$METRO_URL"

if [[ -z "${NO_API_TUNNEL:-}" ]]; then
  port_busy "$API_PORT" || echo "⚠ nothing is listening on :$API_PORT yet — start your backend, or the API tunnel will 502."
  echo "▶ Starting backend API tunnel → http://localhost:$API_PORT ..."
  API_URL="$(start_quick_tunnel "$API_PORT")"
  echo "✔ Backend tunnel: $API_URL  (api.ts/socket.ts will use this)"
  export EXPO_PUBLIC_API_URL="$API_URL"
fi

# Watchdog: if any tunnel dies after startup, stop everything instead of letting
# Expo keep advertising a dead URL (which the phone then can't resolve). $$ is the
# script PID even inside this subshell, so killing it triggers the cleanup trap.
(
  while true; do
    for pid in "${CF_PIDS[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        echo "" >&2
        echo "✖ A Cloudflare tunnel dropped — stopping. Re-run 'npm run tunnel' and rescan the QR." >&2
        kill "$$" 2>/dev/null
        exit 0
      fi
    done
    sleep 5
  done
) &
WATCHDOG_PID=$!

echo "▶ Starting Expo (Metro on :$PORT)..."
METRO_HOST=$(echo "$METRO_URL" | sed 's|https://||')
# Run Metro as a native Windows process to avoid WSL cross-mount file-watching issues
cmd.exe /c "set EXPO_PACKAGER_PROXY_URL=$METRO_URL && set REACT_NATIVE_PACKAGER_HOSTNAME=$METRO_HOST && npx expo start --port $PORT --host localhost"
