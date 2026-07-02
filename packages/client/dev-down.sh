#!/usr/bin/env bash
# Stops backend, temporal worker, cloudflare tunnels, and Expo started by dev-up.sh.
set -uo pipefail

echo "stopping cloudflared tunnels..."
pkill -9 -f cloudflared 2>/dev/null || true

echo "stopping expo/metro..."
pkill -9 -f 'expo' 2>/dev/null || true

echo "stopping backend + temporal worker (ts-node)..."
pkill -9 -f 'ts-node' 2>/dev/null || true

echo "done."
