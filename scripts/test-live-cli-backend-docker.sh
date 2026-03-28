#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${FOXFANG_IMAGE:-foxfang:local}"
LIVE_IMAGE_NAME="${FOXFANG_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${FOXFANG_CONFIG_DIR:-$HOME/.foxfang}"
WORKSPACE_DIR="${FOXFANG_WORKSPACE_DIR:-$HOME/.foxfang/workspace}"
PROFILE_FILE="${FOXFANG_PROFILE_FILE:-$HOME/.profile}"
CLI_TOOLS_DIR="${FOXFANG_DOCKER_CLI_TOOLS_DIR:-$HOME/.cache/foxfang/docker-cli-tools}"
DEFAULT_MODEL="claude-cli/claude-sonnet-4-6"
CLI_MODEL="${FOXFANG_LIVE_CLI_BACKEND_MODEL:-$DEFAULT_MODEL}"
CLI_PROVIDER="${CLI_MODEL%%/*}"
CLI_DISABLE_MCP_CONFIG="${FOXFANG_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG:-}"

if [[ -z "$CLI_PROVIDER" || "$CLI_PROVIDER" == "$CLI_MODEL" ]]; then
  CLI_PROVIDER="claude-cli"
fi
if [[ "$CLI_PROVIDER" == "claude-cli" && -z "$CLI_DISABLE_MCP_CONFIG" ]]; then
  CLI_DISABLE_MCP_CONFIG="0"
fi

mkdir -p "$CLI_TOOLS_DIR"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

AUTH_DIRS=()
if [[ -n "${FOXFANG_DOCKER_AUTH_DIRS:-}" ]]; then
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(foxfang_live_collect_auth_dirs)
else
  while IFS= read -r auth_dir; do
    [[ -n "$auth_dir" ]] || continue
    AUTH_DIRS+=("$auth_dir")
  done < <(foxfang_live_collect_auth_dirs_from_csv "$CLI_PROVIDER")
fi
AUTH_DIRS_CSV="$(foxfang_live_join_csv "${AUTH_DIRS[@]}")"

EXTERNAL_AUTH_MOUNTS=()
for auth_dir in "${AUTH_DIRS[@]}"; do
  host_path="$HOME/$auth_dir"
  if [[ -d "$host_path" ]]; then
    EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth/"$auth_dir":ro)
  fi
done

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && source "$HOME/.profile" || true
export PATH="$HOME/.npm-global/bin:$PATH"
IFS=',' read -r -a auth_dirs <<<"${FOXFANG_DOCKER_AUTH_DIRS_RESOLVED:-}"
for auth_dir in "${auth_dirs[@]}"; do
  [ -n "$auth_dir" ] || continue
  if [ -d "/host-auth/$auth_dir" ]; then
    mkdir -p "$HOME/$auth_dir"
    cp -R "/host-auth/$auth_dir/." "$HOME/$auth_dir"
    chmod -R u+rwX "$HOME/$auth_dir" || true
  fi
done
provider="${FOXFANG_DOCKER_CLI_BACKEND_PROVIDER:-claude-cli}"
if [ "$provider" = "claude-cli" ]; then
  if [ -z "${FOXFANG_LIVE_CLI_BACKEND_COMMAND:-}" ]; then
    export FOXFANG_LIVE_CLI_BACKEND_COMMAND="$HOME/.npm-global/bin/claude"
  fi
  if [ ! -x "${FOXFANG_LIVE_CLI_BACKEND_COMMAND}" ]; then
    npm_config_prefix="$HOME/.npm-global" npm install -g @anthropic-ai/claude-code
  fi
  if [ -z "${FOXFANG_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" ]; then
    export FOXFANG_LIVE_CLI_BACKEND_PRESERVE_ENV='["ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_OLD"]'
  fi
  claude auth status || true
fi
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
tar -C /src \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=ui/dist \
  --exclude=ui/node_modules \
  -cf - . | tar -C "$tmp_dir" -xf -
ln -s /app/node_modules "$tmp_dir/node_modules"
ln -s /app/dist "$tmp_dir/dist"
if [ -d /app/dist-runtime/extensions ]; then
  export FOXFANG_BUNDLED_PLUGINS_DIR=/app/dist-runtime/extensions
elif [ -d /app/dist/extensions ]; then
  export FOXFANG_BUNDLED_PLUGINS_DIR=/app/dist/extensions
fi
cd "$tmp_dir"
pnpm test:live src/gateway/gateway-cli-backend.live.test.ts
EOF

echo "==> Build live-test image: $LIVE_IMAGE_NAME (target=build)"
docker build --target build -t "$LIVE_IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run CLI backend live test in Docker"
echo "==> Model: $CLI_MODEL"
echo "==> Provider: $CLI_PROVIDER"
echo "==> External auth dirs: ${AUTH_DIRS_CSV:-none}"
docker run --rm -t \
  -u node \
  --entrypoint bash \
  -e ANTHROPIC_API_KEY \
  -e ANTHROPIC_API_KEY_OLD \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e FOXFANG_SKIP_CHANNELS=1 \
  -e FOXFANG_VITEST_FS_MODULE_CACHE=0 \
  -e FOXFANG_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
  -e FOXFANG_DOCKER_CLI_BACKEND_PROVIDER="$CLI_PROVIDER" \
  -e FOXFANG_LIVE_TEST=1 \
  -e FOXFANG_LIVE_CLI_BACKEND=1 \
  -e FOXFANG_LIVE_CLI_BACKEND_MODEL="$CLI_MODEL" \
  -e FOXFANG_LIVE_CLI_BACKEND_COMMAND="${FOXFANG_LIVE_CLI_BACKEND_COMMAND:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_ARGS="${FOXFANG_LIVE_CLI_BACKEND_ARGS:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_CLEAR_ENV="${FOXFANG_LIVE_CLI_BACKEND_CLEAR_ENV:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_PRESERVE_ENV="${FOXFANG_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG="$CLI_DISABLE_MCP_CONFIG" \
  -e FOXFANG_LIVE_CLI_BACKEND_RESUME_PROBE="${FOXFANG_LIVE_CLI_BACKEND_RESUME_PROBE:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_IMAGE_PROBE="${FOXFANG_LIVE_CLI_BACKEND_IMAGE_PROBE:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_IMAGE_ARG="${FOXFANG_LIVE_CLI_BACKEND_IMAGE_ARG:-}" \
  -e FOXFANG_LIVE_CLI_BACKEND_IMAGE_MODE="${FOXFANG_LIVE_CLI_BACKEND_IMAGE_MODE:-}" \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.foxfang \
  -v "$WORKSPACE_DIR":/home/node/.foxfang/workspace \
  -v "$CLI_TOOLS_DIR":/home/node/.npm-global \
  "${EXTERNAL_AUTH_MOUNTS[@]}" \
  "${PROFILE_MOUNT[@]}" \
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD"
