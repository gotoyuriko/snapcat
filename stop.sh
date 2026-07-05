#!/usr/bin/env bash
# Stops the API server, Temporal worker, and Expo started by setup.sh.
# Docker services (Postgres/Temporal/MinIO) are left running — stop those
# with `docker compose down` if you want to fully tear down.
set -uo pipefail

echo "stopping expo/metro..."
pkill -9 -f 'expo start' 2>/dev/null || true

echo "stopping API server..."
pkill -9 -f 'ts-node-dev.*packages/server' 2>/dev/null || true

echo "stopping Temporal worker..."
pkill -9 -f 'ts-node.*workflows/worker' 2>/dev/null || true

echo "done. (Docker services still running — 'docker compose down' to stop those too)"
