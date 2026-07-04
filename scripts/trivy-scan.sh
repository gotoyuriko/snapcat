#!/usr/bin/env bash
#
# Trivy Security Scan Script
# 
# Scans the CodingKitty Docker image and filesystem for vulnerabilities.
# Requirement 15.1: Security scanning on payment and donation API surfaces.
#
# Usage:
#   ./scripts/trivy-scan.sh              # Run all scans
#   ./scripts/trivy-scan.sh image        # Scan Docker image only
#   ./scripts/trivy-scan.sh fs           # Scan filesystem/dependencies only
#
# Prerequisites:
#   - Trivy installed: https://aquasecurity.github.io/trivy/
#   - Docker image built (for image scan)
#
# Exit codes:
#   0 = no HIGH/CRITICAL vulnerabilities found
#   1 = vulnerabilities found or scan error
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuration
IMAGE_NAME="${TRIVY_IMAGE:-codingkitty-server:latest}"
SEVERITY="${TRIVY_SEVERITY:-HIGH,CRITICAL}"
EXIT_CODE="${TRIVY_EXIT_CODE:-1}"

echo "=========================================="
echo " CodingKitty Security Scan (Trivy)"
echo "=========================================="
echo ""

# Check if Trivy is installed
if ! command -v trivy &> /dev/null; then
  echo "ERROR: Trivy is not installed."
  echo "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
  echo ""
  echo "Quick install (Linux):"
  echo "  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin"
  echo ""
  exit 1
fi

scan_filesystem() {
  echo "--- Filesystem / Dependency Scan ---"
  echo "Scanning: ${PROJECT_ROOT}/packages/server"
  echo "Severity filter: ${SEVERITY}"
  echo ""

  trivy fs \
    --severity "${SEVERITY}" \
    --exit-code "${EXIT_CODE}" \
    --scanners vuln \
    "${PROJECT_ROOT}/packages/server"

  echo ""
  echo "Filesystem scan complete."
  echo ""
}

scan_image() {
  echo "--- Docker Image Scan ---"
  echo "Image: ${IMAGE_NAME}"
  echo "Severity filter: ${SEVERITY}"
  echo ""

  # Check if the image exists
  if ! docker image inspect "${IMAGE_NAME}" &> /dev/null; then
    echo "WARNING: Docker image '${IMAGE_NAME}' not found."
    echo "Build the image first: docker build -t ${IMAGE_NAME} ."
    echo "Skipping image scan."
    echo ""
    return 0
  fi

  trivy image \
    --severity "${SEVERITY}" \
    --exit-code "${EXIT_CODE}" \
    --scanners vuln \
    "${IMAGE_NAME}"

  echo ""
  echo "Image scan complete."
  echo ""
}

# Determine scan mode
SCAN_MODE="${1:-all}"

case "${SCAN_MODE}" in
  fs|filesystem)
    scan_filesystem
    ;;
  image)
    scan_image
    ;;
  all)
    scan_filesystem
    scan_image
    ;;
  *)
    echo "Unknown scan mode: ${SCAN_MODE}"
    echo "Usage: $0 [all|fs|image]"
    exit 1
    ;;
esac

echo "=========================================="
echo " All scans passed!"
echo "=========================================="
