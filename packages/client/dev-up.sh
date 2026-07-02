#!/usr/bin/env bash
# Starts backend, temporal worker, cloudflare tunnels, and Expo — all detached
# with nohup so they survive the launching shell. Logs go to /tmp/ck-*.log.
set -uo pipefail

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null

ROOT="/home/gotoyuriko/workspace/codingkitty"
CLI="$HOME/cloudflared"

echo "cleaning old processes..."
pkill -9 -f cloudflared 2>/dev/null || true
pkill -9 -f 'expo' 2>/dev/null || true
pkill -9 -f 'ts-node' 2>/dev/null || true
sleep 2

echo "starting backend (port 3000)..."
cd "$ROOT/packages/server"
nohup npm run dev > /tmp/ck-server.log 2>&1 &

echo "starting temporal worker..."
nohup npm run worker > /tmp/ck-worker.log 2>&1 &

echo "starting cloudflare tunnels..."
nohup "$CLI" tunnel --no-autoupdate --protocol http2 --retries 5 --url http://127.0.0.1:8082 > /tmp/cf-metro.log 2>&1 &
nohup "$CLI" tunnel --no-autoupdate --protocol http2 --retries 5 --url http://127.0.0.1:3000 > /tmp/cf-api.log 2>&1 &

echo "waiting for tunnel URLs..."
METRO_URL=""
API_URL=""
for _ in $(seq 1 40); do
  METRO_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-metro.log 2>/dev/null | head -1)"
  API_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-api.log 2>/dev/null | head -1)"
  [[ -n "$METRO_URL" && -n "$API_URL" ]] && break
  sleep 1
done

if [[ -z "$METRO_URL" || -z "$API_URL" ]]; then
  echo "FAILED to get tunnel URLs"
  exit 1
fi

echo "METRO_URL=$METRO_URL"
echo "API_URL=$API_URL"

METRO_HOST="${METRO_URL#https://}"

echo "starting Expo..."
cd "$ROOT/packages/client"
EXPO_PACKAGER_PROXY_URL="$METRO_URL" \
EXPO_PUBLIC_API_URL="$API_URL" \
REACT_NATIVE_PACKAGER_HOSTNAME="$METRO_HOST" \
nohup npx expo start --port 8082 --host localhost > /tmp/ck-expo.log 2>&1 &

echo "done. URLs written to /tmp/ck-urls.txt"
echo "exp://$METRO_HOST" > /tmp/ck-urls.txt
echo "API: $API_URL" >> /tmp/ck-urls.txt
