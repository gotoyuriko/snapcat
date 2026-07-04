#!/usr/bin/env bash
set -euo pipefail
grep -rl "numRuns" packages/server/src --include="*.ts" | while read -r f; do
  sed -i \
    -e 's/numRuns: 500/numRuns: 50/g' \
    -e 's/numRuns: 200/numRuns: 30/g' \
    -e 's/numRuns: 100/numRuns: 20/g' \
    "$f"
done
echo "done"
