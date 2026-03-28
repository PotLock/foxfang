#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${FOXFANG_INSTALL_E2E_IMAGE:-foxfang-install-e2e:local}"
INSTALL_URL="${FOXFANG_INSTALL_URL:-https://foxfang.bot/install.sh}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
FOXFANG_E2E_MODELS="${FOXFANG_E2E_MODELS:-}"

echo "==> Build image: $IMAGE_NAME"
docker build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker/install-sh-e2e"

echo "==> Run E2E installer test"
docker run --rm \
  -e FOXFANG_INSTALL_URL="$INSTALL_URL" \
  -e FOXFANG_INSTALL_TAG="${FOXFANG_INSTALL_TAG:-latest}" \
  -e FOXFANG_E2E_MODELS="$FOXFANG_E2E_MODELS" \
  -e FOXFANG_INSTALL_E2E_PREVIOUS="${FOXFANG_INSTALL_E2E_PREVIOUS:-}" \
  -e FOXFANG_INSTALL_E2E_SKIP_PREVIOUS="${FOXFANG_INSTALL_E2E_SKIP_PREVIOUS:-0}" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e ANTHROPIC_API_TOKEN="$ANTHROPIC_API_TOKEN" \
  "$IMAGE_NAME"
