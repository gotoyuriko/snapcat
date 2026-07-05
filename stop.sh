#!/usr/bin/env bash
# Stops the API server, Temporal worker, and Expo started by setup.sh.
# Docker services (Postgres/Temporal/MinIO) are left running — stop those
# with `docker compose down` if you want to fully tear down.
set -uo pipefail

# Git Bash on Windows has no pkill — fall back to PowerShell there.
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

echo "stopping expo/metro..."
kill_matching 'expo start'

echo "stopping API server..."
kill_matching 'ts-node-dev'

echo "stopping Temporal worker..."
kill_matching 'worker\.ts'

echo "done. (Docker services still running — 'docker compose down' to stop those too)"
